import type { SubscriptionTier } from '@danceclass/shared'

export async function getActiveTier(
  userId: string,
  supabase: { from: (table: string) => any }
): Promise<SubscriptionTier> {
  const { data } = await supabase
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .in('status', ['active', 'grace'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return 'none'

  const graceCutoff = new Date(new Date(data.expires_at).getTime() + 7 * 24 * 60 * 60 * 1000)
  if (graceCutoff <= new Date()) return 'none'

  return data.tier as SubscriptionTier
}
