import { createClient } from '@/lib/supabase/server'
import ExploreClient from '@/components/feed/ExploreClient'

export default async function ExplorePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: recentClasses },
    { data: allUsers },
    { data: myFollows },
    { data: myFriendships },
  ] = await Promise.all([
    (supabase as any)
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30),
    (supabase as any)
      .from('profiles')
      .select('*')
      .neq('id', user?.id ?? '')
      .eq('is_confirmed' as any, true)
      .order('full_name', { ascending: true })
      .limit(100),
    user
      ? supabase.from('follows').select('following_id').eq('follower_id', user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from('friendships').select('*').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      : Promise.resolve({ data: [] }),
  ])

  type FollowRow = { following_id: string }
  type FriendRow = { requester_id: string; addressee_id: string; status: string }
  const followingIds = new Set((myFollows as FollowRow[] | null ?? []).map(f => f.following_id))

  type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
  const friendMap: Record<string, FriendStatus> = {}
  for (const f of (myFriendships as FriendRow[] | null) ?? []) {
    const otherId = f.requester_id === user?.id ? f.addressee_id : f.requester_id
    if (f.status === 'accepted') {
      friendMap[otherId] = 'accepted'
    } else if (f.status === 'pending') {
      friendMap[otherId] = f.requester_id === user?.id ? 'pending_sent' : 'pending_received'
    }
  }

  return (
    <ExploreClient
      classes={recentClasses ?? []}
      users={allUsers ?? []}
      currentUserId={user?.id ?? ''}
      followingIds={Array.from(followingIds)}
      friendStatuses={friendMap}
    />
  )
}
