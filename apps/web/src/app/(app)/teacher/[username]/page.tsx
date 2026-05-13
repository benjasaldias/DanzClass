import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TeacherProfileClient from '@/components/profile/TeacherProfileClient'

interface Props {
  params: { username: string }
}

export default async function UserProfilePage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileUser } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()

  if (!profileUser) notFound()

  const isOwnProfile = user?.id === profileUser.id

  const [
    { data: classes },
    { count: followersCount },
    followData,
    enrolledData,
    friendshipData,
  ] = await Promise.all([
    supabase
      .from('classes')
      .select('*, media:class_media(*)')
      .eq('teacher_id', profileUser.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileUser.id),
    user && !isOwnProfile
      ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', profileUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Inscripciones: solo si son públicas o es el propio perfil
    profileUser.enrolled_classes_public || isOwnProfile
      ? supabase
          .from('enrollments')
          .select('*, class:classes(*, media:class_media(*))')
          .eq('student_id', profileUser.id)
          .in('status', ['confirmed', 'payment_submitted'])
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    // Estado de amistad
    user && !isOwnProfile
      ? supabase
          .from('friendships')
          .select('*')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .or(`requester_id.eq.${profileUser.id},addressee_id.eq.${profileUser.id}`)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
  let friendStatus: FriendStatus = 'none'
  if (friendshipData.data) {
    const f = friendshipData.data
    if (f.status === 'accepted') {
      friendStatus = 'accepted'
    } else if (f.status === 'pending') {
      friendStatus = f.requester_id === user?.id ? 'pending_sent' : 'pending_received'
    }
  }

  return (
    <TeacherProfileClient
      teacher={profileUser}
      classes={classes ?? []}
      enrolledClasses={enrolledData.data ?? []}
      followersCount={followersCount ?? 0}
      isFollowing={!!followData.data}
      currentUserId={user?.id}
      isOwnProfile={isOwnProfile}
      friendStatus={friendStatus}
    />
  )
}
