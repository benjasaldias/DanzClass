import { createClient } from '@/lib/supabase/server'
import ExploreClient from '@/components/feed/ExploreClient'

export default async function ExplorePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Profesores = usuarios con suscripción teacher o pro activa
  const { data: rawTeacherSubs } = await supabase
    .from('subscriptions')
    .select('user_id')
    .in('tier', ['teacher', 'pro'])
    .in('status', ['active', 'grace'])

  const teacherSubs = rawTeacherSubs as { user_id: string }[] | null
  const teacherIds = teacherSubs?.map(s => s.user_id) ?? []

  const [
    { data: teachers },
    { data: recentClasses },
    { data: allUsers },
    { data: myFollows },
    { data: myFriendships },
  ] = await Promise.all([
    teacherIds.length > 0
      ? supabase.from('profiles').select('*').in('id', teacherIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id ?? '')
      .order('full_name', { ascending: true })
      .limit(100),
    user
      ? supabase.from('follows').select('following_id').eq('follower_id', user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from('friendships').select('*').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      : Promise.resolve({ data: [] }),
  ])

  const followingIds = new Set((myFollows ?? []).map((f: any) => f.following_id))

  type FriendshipRow = { requester_id: string; addressee_id: string; status: string }
  // Mapa userId → estado de amistad desde la perspectiva del usuario actual
  type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
  const friendMap: Record<string, FriendStatus> = {}
  for (const f of (myFriendships ?? []) as FriendshipRow[]) {
    const otherId = f.requester_id === user?.id ? f.addressee_id : f.requester_id
    if (f.status === 'accepted') {
      friendMap[otherId] = 'accepted'
    } else if (f.status === 'pending') {
      friendMap[otherId] = f.requester_id === user?.id ? 'pending_sent' : 'pending_received'
    }
  }

  return (
    <ExploreClient
      teachers={teachers ?? []}
      classes={recentClasses ?? []}
      users={allUsers ?? []}
      currentUserId={user?.id ?? ''}
      followingIds={Array.from(followingIds)}
      friendStatuses={friendMap}
    />
  )
}
