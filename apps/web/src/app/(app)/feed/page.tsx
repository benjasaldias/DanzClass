import { createClient } from '@/lib/supabase/server'
import FeedClient from '@/components/feed/FeedClient'

export default async function FeedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: follows }, { data: friendships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('follows').select('following_id').eq('follower_id', user!.id),
    (supabase as any).from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`),
  ])

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

  const followingIds = (follows as { following_id: string }[] | null)?.map(f => f.following_id) ?? []

  // Get friend IDs for 2x display
  const friendIds = (friendships as any[] ?? []).map((f: any) =>
    f.requester_id === user!.id ? f.addressee_id : f.requester_id
  )

  // Fetch active 2x requests from friends for active classes
  const twoxQuery = friendIds.length > 0
    ? await (supabase as any)
        .from('class_2x_requests')
        .select('*, user:profiles!user_id(username, full_name, avatar_url), class:classes!class_id(title, price_2x, price_suelta_2x, type, teacher_id)')
        .in('user_id', friendIds)
        .eq('status', 'looking')
        .limit(10)
    : { data: [] }

  // Exclude requests for classes the current user teaches
  const friendsTwox = (twoxQuery.data as any[] ?? []).filter(
    (r: any) => r.class?.teacher_id !== user!.id
  )

  const [{ data: classes }, { data: posts }] = await Promise.all([classesQuery, postsQuery])

  // Batch-fetch ratings for teachers of initial classes
  const teacherIds = [...new Set((classes ?? []).map((c: any) => c.teacher_id as string))]
  const ratingsRows = teacherIds.length > 0
    ? ((await (supabase as any).from('ratings').select('rated_user_id, stars').in('rated_user_id', teacherIds)).data ?? []) as { rated_user_id: string; stars: number }[]
    : []
  const initialTeacherRatings: Record<string, { avg_stars: number; rating_count: number }> = {}
  for (const row of ratingsRows) {
    if (!initialTeacherRatings[row.rated_user_id]) initialTeacherRatings[row.rated_user_id] = { avg_stars: 0, rating_count: 0 }
    initialTeacherRatings[row.rated_user_id].rating_count++
    initialTeacherRatings[row.rated_user_id].avg_stars += Number(row.stars)
  }
  for (const id of Object.keys(initialTeacherRatings)) {
    initialTeacherRatings[id].avg_stars = Math.round((initialTeacherRatings[id].avg_stars / initialTeacherRatings[id].rating_count) * 10) / 10
  }

  return (
    <FeedClient
      initialClasses={(classes as any[]) ?? []}
      initialPosts={(posts as any[]) ?? []}
      currentUser={user!}
      currentProfile={profile}
      followingIds={followingIds}
      friendsTwoxRequests={friendsTwox}
      initialTeacherRatings={initialTeacherRatings}
    />
  )
}
