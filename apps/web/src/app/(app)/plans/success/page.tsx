import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveTier } from '@/lib/subscription'
import type { SubscriptionTier } from '@danceclass/shared'

export default async function PlanSuccessPage({
  searchParams,
}: {
  searchParams: { payment_id?: string; status?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { payment_id, status } = searchParams

  if (payment_id && status === 'approved') {
    try {
      const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
      const paymentClient = new Payment(mp)
      const payment = await paymentClient.get({ id: payment_id })

      console.log('[plans/success] payment status:', payment.status, '| ref:', payment.external_reference)

      if (payment.status === 'approved' && payment.external_reference) {
        const [refUserId, tier] = payment.external_reference.split(':')

        if (refUserId === user.id && ['basic', 'teacher', 'pro'].includes(tier)) {
          // El webhook puede haberlo creado ya; solo activamos si no existe
          const currentTier = await getActiveTier(user.id, supabase)

          if (currentTier === 'none') {
            const admin = createAdminClient()
            const now = new Date()
            const expiresAt = new Date(now)
            expiresAt.setMonth(expiresAt.getMonth() + 1)

            await admin
              .from('subscriptions')
              .update({ status: 'expired' })
              .eq('user_id', user.id)
              .in('status', ['active', 'grace'])

            const { error } = await admin.from('subscriptions').insert({
              user_id: user.id,
              tier: tier as Exclude<SubscriptionTier, 'none'>,
              status: 'active',
              started_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
              mp_subscription_id: String(payment.id),
            })

            if (error) {
              console.error('[plans/success] insert error:', error)
            } else {
              console.log('[plans/success] subscription activated for user:', user.id, 'tier:', tier)
            }
          }
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
