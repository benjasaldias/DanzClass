import { createClient } from '@/lib/supabase/server'
import FeedClient from '@/components/feed/FeedClient'

export default async function FeedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch following IDs
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user!.id)

  const followingIds = follows?.map(f => f.following_id) ?? []

  // Initial feed data: global
  const { data: classes } = await supabase
    .from('classes')
    .select(`
      *,
      teacher:profiles!teacher_id(*),
      media:class_media(*)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <FeedClient
      initialClasses={classes ?? []}
      currentUser={user!}
      currentProfile={profile}
      followingIds={followingIds}
    />
  )
}
