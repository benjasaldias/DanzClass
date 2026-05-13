import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@danceclass/shared'

const VALID_TIERS = ['basic', 'teacher', 'pro']

async function activateIfNew(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  tier: string,
  mpId: string
) {
  // Idempotente: no duplicar si ya fue procesado por el webhook
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
  expiresAt.setMonth(expiresAt.getMonth() + 1)

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
    console.log('[plans/success] subscription activated — user:', userId, 'tier:', tier)
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

  // ── Recurring subscription authorization ────────────────────────────────────
  if (preapproval_id) {
    try {
      const preApproval = new PreApproval(mp)
      const sub = await preApproval.get({ id: preapproval_id })

      console.log('[plans/success] preapproval status:', sub.status, '| ref:', sub.external_reference)

      if (sub.external_reference && sub.id) {
        const [refUserId, tier] = sub.external_reference.split(':')
        if (refUserId === user.id && VALID_TIERS.includes(tier)) {
          await activateIfNew(admin, user.id, tier, sub.id)
        }
      }
    } catch (e) {
      console.error('[plans/success] preapproval verification error:', e)
    }
  }

  // ── One-time payment fallback ────────────────────────────────────────────────
  if (payment_id && status === 'approved') {
    try {
      const paymentClient = new Payment(mp)
      const payment = await paymentClient.get({ id: payment_id })

      console.log('[plans/success] payment status:', payment.status, '| ref:', payment.external_reference)

      if (payment.status === 'approved' && payment.external_reference) {
        const [refUserId, tier] = payment.external_reference.split(':')
        if (refUserId === user.id && VALID_TIERS.includes(tier)) {
          await activateIfNew(admin, user.id, tier, String(payment.id))
        }
      }
    } catch (e) {
      console.error('[plans/success] payment verification error:', e)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle className="h-9 w-9 text-green-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago exitoso</h1>
      <p className="text-gray-500 text-sm mb-1">Tu suscripción está activa.</p>
      <Link href="/plans" className="btn-primary px-8 mt-8">
        Ver mi plan
      </Link>
    </div>
  )
}
