import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveTier } from '@/lib/subscription'
import { SubscriptionPolling } from '@/components/plans/SubscriptionPolling'
import type { SubscriptionTier } from '@danceclass/shared'

const VALID_TIERS = ['basic', 'teacher', 'pro']
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

async function rewardReferralIfNeeded(admin: ReturnType<typeof createAdminClient>, referredUserId: string) {
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('referred_by, referral_rewarded')
    .eq('id', referredUserId)
    .maybeSingle()

  if (!profile?.referred_by || profile.referral_rewarded) return

  const referrerId = profile.referred_by as string

  // Extend referrer subscription +30 days (or create free Pro month)
  const { data: referrerSub } = await admin
    .from('subscriptions')
    .select('id, expires_at, tier')
    .eq('user_id', referrerId)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (referrerSub) {
    const newExpiry = new Date(new Date(referrerSub.expires_at).getTime() + THIRTY_DAYS_MS)
    await admin.from('subscriptions').update({ expires_at: newExpiry.toISOString() }).eq('id', referrerSub.id)
  } else {
    const now = new Date()
    await admin.from('subscriptions').insert({
      user_id: referrerId,
      tier: 'pro',
      status: 'active',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + THIRTY_DAYS_MS).toISOString(),
      mp_subscription_id: `referral_${referredUserId.slice(0, 8)}_${Date.now()}`,
    })
  }

  // Extend referred user's new subscription +30 days too
  const { data: referredSub } = await admin
    .from('subscriptions')
    .select('id, expires_at')
    .eq('user_id', referredUserId)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (referredSub) {
    const newExpiry = new Date(new Date(referredSub.expires_at).getTime() + THIRTY_DAYS_MS)
    await admin.from('subscriptions').update({ expires_at: newExpiry.toISOString() }).eq('id', referredSub.id)
  }

  await (admin as any).from('profiles').update({ referral_rewarded: true }).eq('id', referredUserId)
  console.log('[referral] rewarded — referred:', referredUserId, 'referrer:', referrerId)
}

async function activateIfNew(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  tier: string,
  mpId: string,
  months = 1
) {
  // Idempotente: no duplicar si el webhook ya lo procesó
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id')
    .eq('mp_subscription_id', mpId)
    .maybeSingle()

  if (existing) {
    console.log('[plans/success] subscription already active for mp_id:', mpId)
    return
  }

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  await admin
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .in('status', ['active', 'grace'])

  const { error } = await admin.from('subscriptions').insert({
    user_id: userId,
    tier: tier as Exclude<SubscriptionTier, 'none'>,
    status: 'active',
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    mp_subscription_id: mpId,
  })

  if (error) {
    console.error('[plans/success] insert error:', error)
  } else {
    console.log('[plans/success] subscription activated — user:', userId, 'tier:', tier, 'months:', months)
  }
}

export default async function PlanSuccessPage({
  searchParams,
}: {
  searchParams: { payment_id?: string; status?: string; preapproval_id?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { payment_id, status, preapproval_id } = searchParams
  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const admin = createAdminClient()

  let subscriptionActivated = false

  // ── Suscripción recurrente (mensual con crédito) ─────────────────────────────
  if (preapproval_id) {
    try {
      const preApproval = new PreApproval(mp)
      const sub = await preApproval.get({ id: preapproval_id })

      console.log('[plans/success] preapproval status:', sub.status, '| ref:', sub.external_reference)

      if (sub.external_reference && sub.id) {
        const [refUserId, tier] = sub.external_reference.split(':')
        if (refUserId === user.id && VALID_TIERS.includes(tier)) {
          await activateIfNew(admin, user.id, tier, sub.id, 1)
          subscriptionActivated = true
        }
      }
    } catch (e) {
      console.error('[plans/success] preapproval verification error:', e)
    }
  }

  // ── Pago único: mensual legacy o anual ──────────────────────────────────────
  if (payment_id && status === 'approved') {
    try {
      const paymentClient = new Payment(mp)
      const payment = await paymentClient.get({ id: payment_id })

      console.log('[plans/success] payment status:', payment.status, '| ref:', payment.external_reference)

      if (payment.status === 'approved' && payment.external_reference) {
        const parts = payment.external_reference.split(':')
        const refUserId = parts[0]
        const tier = parts[1]
        const period = parts[2] // 'annual' o undefined
        const months = period === 'annual' ? 12 : 1

        if (refUserId === user.id && VALID_TIERS.includes(tier)) {
          await activateIfNew(admin, user.id, tier, String(payment.id), months)
          subscriptionActivated = true
        }
      }
    } catch (e) {
      console.error('[plans/success] payment verification error:', e)
    }
  }

  // ── Referral reward (first subscription only) ────────────────────────────────
  if (subscriptionActivated) {
    try {
      await rewardReferralIfNeeded(admin, user.id)
    } catch (e) {
      console.error('[plans/success] referral reward error:', e)
    }
  }

  const currentTier = await getActiveTier(user.id, admin)

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
        <CheckCircle className="h-9 w-9 text-green-600 dark:text-green-400" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text mb-2">¡Pago exitoso!</h1>
      <SubscriptionPolling initialTier={currentTier} />
      <Link href="/plans" className="btn-primary px-8 mt-8">
        Ver mi plan
      </Link>
      {/* Deep link para usuarios que llegaron desde la app mobile */}
      <a
        href="danceclass://plans/success"
        className="mt-4 text-sm text-brand-600 dark:text-brand-400 underline underline-offset-2"
      >
        Volver a la app
      </a>
    </div>
  )
}
