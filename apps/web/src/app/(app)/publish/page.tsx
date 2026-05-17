import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublishChoiceClient from '@/components/publish/PublishChoiceClient'
import type { SubscriptionTier } from '@danceclass/shared'

export default async function PublishPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileRes, subscriptionRes, postCountRes] = await Promise.all([
    supabase.from('profiles').select('city').eq('id', user.id).single(),
    supabase.from('subscriptions').select('tier').eq('user_id', user.id).in('status', ['active', 'grace']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('posts' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const tier: SubscriptionTier = (subscriptionRes.data?.tier as SubscriptionTier) ?? 'none'
  const videoPostCount = postCountRes.count ?? 0

  return (
    <PublishChoiceClient
      userId={user.id}
      userCity={profileRes.data?.city ?? null}
      tier={tier}
      videoPostCount={videoPostCount}
    />
  )
}
