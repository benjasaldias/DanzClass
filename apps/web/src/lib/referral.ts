import { createAdminClient } from './supabase/admin'
import { logger } from './logger'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Otorga el premio de referido (+30 días Pro a ambos) la PRIMERA vez que el
// usuario referido activa una suscripción. Idempotente vía profiles.referral_rewarded.
//
// Se llama desde DOS lugares para no depender de que el referido cargue la
// página de éxito: (1) el webhook de Mercado Pago cuando activa una suscripción
// nueva, y (2) plans/success como fallback si el webhook aún no llegó. El flag
// referral_rewarded hace que la segunda llamada sea no-op.
export async function rewardReferralIfNeeded(
  admin: ReturnType<typeof createAdminClient>,
  referredUserId: string
): Promise<void> {
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('referred_by, referral_rewarded')
    .eq('id', referredUserId)
    .maybeSingle()

  if (!profile?.referred_by || profile.referral_rewarded) return

  const referrerId = profile.referred_by as string

  // Marca ANTES de aplicar (idempotencia ante carreras webhook↔success): si dos
  // llamadas entran a la vez, solo la que gane el flag aplica el premio.
  const { data: claimed } = await (admin as any)
    .from('profiles')
    .update({ referral_rewarded: true })
    .eq('id', referredUserId)
    .eq('referral_rewarded', false)
    .select('id')
    .maybeSingle()

  if (!claimed) return // otra llamada ya lo reclamó

  // Extiende la suscripción del referidor +30 días (o crea un mes Pro gratis).
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
    await admin.from('subscriptions').update({ expires_at: newExpiry.toISOString() } as any).eq('id', referrerSub.id)
  } else {
    const now = new Date()
    await (admin as any).from('subscriptions').insert({
      user_id: referrerId,
      tier: 'pro',
      status: 'active',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + THIRTY_DAYS_MS).toISOString(),
      mp_subscription_id: `referral_${referredUserId.slice(0, 8)}_${Date.now()}`,
    })
  }

  // Extiende también la suscripción recién creada del referido +30 días.
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
    await admin.from('subscriptions').update({ expires_at: newExpiry.toISOString() } as any).eq('id', referredSub.id)
  }

  logger.info('referral:rewarded', { referred: referredUserId, referrer: referrerId })
}
