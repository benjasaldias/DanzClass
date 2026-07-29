// Fuente única de verdad de "qué tier tiene activo un usuario ahora mismo" (P1-2).
//
// Antes de esta consolidación, web resolvía el tier con `getActiveTier` (que
// respeta `expires_at` + 7 días de gracia) mientras mobile lo resolvía en 9
// lugares con un `.eq('status', 'active').single()` crudo: una suscripción
// vencida (el webhook la deja en `active` a propósito — "el expires_at
// natural actúa de grace period") seguía dando acceso completo en la app
// móvil mientras la web ya lo negaba. Todo consumidor nuevo debe importar
// desde acá, no reimplementar la resolución de tier.

import type { SubscriptionTier } from '../types/index'

type SubRow = { id: string; tier: string; status: string; expires_at: string }
type SupabaseLike = { from: (table: string) => any }

function isWithinGrace(expiresAt: string): boolean {
  const graceCutoff = new Date(new Date(expiresAt).getTime() + 7 * 24 * 60 * 60 * 1000)
  return graceCutoff > new Date()
}

async function fetchActiveSub(userId: string, supabase: SupabaseLike): Promise<SubRow | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, tier, status, expires_at')
    .eq('user_id', userId)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  if (!isWithinGrace(data.expires_at)) return null
  return data as SubRow
}

/** Suscripción cancelada que todavía tiene tiempo restante (banner "acceso hasta X"). */
export async function getCancelledPendingExpiry(
  userId: string,
  supabase: SupabaseLike
): Promise<{ id: string; tier: SubscriptionTier; expires_at: string } | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, tier, status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'cancelled')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return { id: data.id, tier: data.tier as SubscriptionTier, expires_at: data.expires_at }
}

/** Tier activo real del usuario (`'none'` si no tiene ninguno vigente). */
export async function getActiveTier(userId: string, supabase: SupabaseLike): Promise<SubscriptionTier> {
  const sub = await fetchActiveSub(userId, supabase)
  return sub ? (sub.tier as SubscriptionTier) : 'none'
}

export async function getActiveSubscription(
  userId: string,
  supabase: SupabaseLike
): Promise<{ id: string; tier: SubscriptionTier; expires_at: string } | null> {
  const sub = await fetchActiveSub(userId, supabase)
  if (!sub) return null
  return { id: sub.id, tier: sub.tier as SubscriptionTier, expires_at: sub.expires_at }
}
