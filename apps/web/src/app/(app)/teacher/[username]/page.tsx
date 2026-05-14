import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TeacherProfileClient from '@/components/profile/TeacherProfileClient'
import EndorsementPopup from '@/components/ui/EndorsementPopup'
import type { Profile } from '@danceclass/shared'

interface Props {
  params: { username: string }
}

export default async function UserProfilePage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()

  const profileUser = rawProfile as Profile | null
  if (!profileUser) notFound()

  const isOwnProfile = user?.id === profileUser.id

  const [
    { data: classes },
    { count: followersCount },
    followData,
    enrolledData,
    friendshipData,
    trustData,
    { count: classesCount },
    { count: paidSpotsCount },
    hasEndorsedData,
    pastClassesData,
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

    profileUser.enrolled_classes_public || isOwnProfile
      ? supabase
          .from('enrollments')
          .select('*, class:classes(*, media:class_media(*))')
          .eq('student_id', profileUser.id)
          .in('status', ['confirmed', 'payment_submitted'])
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),

    user && !isOwnProfile
      ? supabase
          .from('friendships')
          .select('*')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .or(`requester_id.eq.${profileUser.id},addressee_id.eq.${profileUser.id}`)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Trust count for this user
    supabase.from('trust_endorsements' as any).select('*', { count: 'exact', head: true }).eq('endorsed_id', profileUser.id),

    // Classes taught count
    supabase.from('classes').select('*', { count: 'exact', head: true }).eq('teacher_id', profileUser.id),

    // Paid spots count (confirmed enrollments in teacher's classes)
    supabase
      .from('enrollments')
      .select('*, class:classes!inner(*)', { count: 'exact', head: true })
      .eq('class.teacher_id', profileUser.id)
      .eq('status', 'confirmed'),

    // Has current user endorsed this profile?
    user && !isOwnProfile
      ? supabase.from('trust_endorsements' as any).select('*').eq('endorser_id', user.id).eq('endorsed_id', profileUser.id).maybeSingle()
      : Promise.resolve({ data: null }),

    // Past classes where current user was confirmed (for endorsement popup)
    user
      ? supabase
          .from('enrollments')
          .select('*, class:classes!inner(id, title, teacher_id, date, type, teacher:profiles!teacher_id(full_name))')
          .eq('student_id', user.id)
          .eq('status', 'confirmed')
          .not('class.teacher_id', 'eq', user.id)
      : Promise.resolve({ data: [] }),
  ])

  type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
  type FriendRow = { status: string; requester_id: string; addressee_id: string }
  let friendStatus: FriendStatus = 'none'
  if (friendshipData.data) {
    const f = friendshipData.data as FriendRow
    if (f.status === 'accepted') {
      friendStatus = 'accepted'
    } else if (f.status === 'pending') {
      friendStatus = f.requester_id === user?.id ? 'pending_sent' : 'pending_received'
    }
  }

  // Filter past classes where the class date has already passed (suelta)
  const today = new Date().toISOString().split('T')[0]
  const pastForEndorsement = ((pastClassesData as any).data ?? [])
    .filter((e: any) => {
      const cls = e.class
      if (!cls) return false
      if (cls.type === 'suelta' && cls.date && cls.date < today) return true
      return false
    })
    .map((e: any) => ({
      teacherId: e.class.teacher_id,
      teacherName: e.class.teacher?.full_name ?? '',
      classTitle: e.class.title,
      classId: e.class.id,
    }))

  return (
    <>
      <TeacherProfileClient
        teacher={profileUser}
        classes={classes ?? []}
        enrolledClasses={enrolledData.data ?? []}
        followersCount={followersCount ?? 0}
        isFollowing={!!followData.data}
        currentUserId={user?.id}
        isOwnProfile={isOwnProfile}
        friendStatus={friendStatus}
        trustCount={(trustData as any).count ?? 0}
        classesCount={classesCount ?? 0}
        paidSpotsCount={paidSpotsCount ?? 0}
        hasEndorsed={!!(hasEndorsedData as any).data}
      />
      {user && pastForEndorsement.length > 0 && (
        <EndorsementPopup endorserId={user.id} pastClasses={pastForEndorsement} />
      )}
    </>
  )
}
