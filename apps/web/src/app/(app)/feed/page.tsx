import { createClient } from '@/lib/supabase/server'
import FeedClient from '@/components/feed/FeedClient'

export default async function FeedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: follows }, { data: classes }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('follows').select('following_id').eq('follower_id', user!.id),
    supabase
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('posts' as any)
      .select('*, user:profiles!user_id(*)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const followingIds = (follows as { following_id: string }[] | null)?.map(f => f.following_id) ?? []

  return (
    <FeedClient
      initialClasses={classes ?? []}
      initialPosts={(posts as any[]) ?? []}
      currentUser={user!}
      currentProfile={profile}
      followingIds={followingIds}
    />
  )
}
