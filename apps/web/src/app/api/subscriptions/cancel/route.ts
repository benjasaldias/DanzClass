import { NextResponse } from 'next/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Fetch active subscription to get the MP preapproval ID
  const { data: activeSub } = await admin
    .from('subscriptions')
    .select('id, mp_subscription_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Try to cancel the recurring subscription in MP
  if (activeSub?.mp_subscription_id) {
    try {
      const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
      const preApproval = new PreApproval(mp)
      await preApproval.update({
        id: String(activeSub.mp_subscription_id),
        body: { status: 'cancelled' },
      })
      logger.info('subscription_cancel_mp', { mp_subscription_id: activeSub.mp_subscription_id })
    } catch (e) {
      // If MP cancellation fails (e.g., one-time payment ID, not a preapproval), just log
      logger.warn('subscription_cancel_mp_skipped', {
        mp_subscription_id: activeSub.mp_subscription_id,
        reason: (e as any)?.message ?? String(e),
      })
    }
  }

  // Mark as cancelled in DB regardless
  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .in('status', ['active', 'grace'])

  if (error) {
    logger.error('subscription_cancel_db_failed', error, { user_id: user.id })
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
