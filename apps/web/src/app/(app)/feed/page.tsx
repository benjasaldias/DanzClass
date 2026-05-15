import { createClient } from '@/lib/supabase/server'
import FeedClient from '@/components/feed/FeedClient'

export default async function FeedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: follows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('follows').select('following_id').eq('follower_id', user!.id),
  ])

  // Typed separately to avoid TS depth error with nested selects
  const classesQuery = supabase
    .from('classes')
    .select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id, status)' as any)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)

  const postsQuery = (supabase as any)
    .from('posts')
    .select('*, user:profiles!user_id(*)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(20)

  const [{ data: classes }, { data: posts }] = await Promise.all([classesQuery, postsQuery])

  const followingIds = (follows as { following_id: string }[] | null)?.map(f => f.following_id) ?? []

  return (
    <FeedClient
      initialClasses={(classes as any[]) ?? []}
      initialPosts={(posts as any[]) ?? []}
      currentUser={user!}
      currentProfile={profile}
      followingIds={followingIds}
    />
  )
}
