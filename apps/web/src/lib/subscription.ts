import type { SubscriptionTier } from '@danceclass/shared'

type SubRow = { id: string; tier: string; expires_at: string }

function isWithinGrace(expiresAt: string): boolean {
  const graceCutoff = new Date(new Date(expiresAt).getTime() + 7 * 24 * 60 * 60 * 1000)
  return graceCutoff > new Date()
}

async function fetchActiveSub(
  userId: string,
  supabase: { from: (table: string) => any }
): Promise<SubRow | null> {
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

export async function getActiveTier(
  userId: string,
  supabase: { from: (table: string) => any }
): Promise<SubscriptionTier> {
  const sub = await fetchActiveSub(userId, supabase)
  return sub ? (sub.tier as SubscriptionTier) : 'none'
}

export async function getActiveSubscription(
  userId: string,
  supabase: { from: (table: string) => any }
): Promise<{ id: string; tier: SubscriptionTier; expires_at: string } | null> {
  const sub = await fetchActiveSub(userId, supabase)
  if (!sub) return null
  return { id: sub.id, tier: sub.tier as SubscriptionTier, expires_at: sub.expires_at }
}
