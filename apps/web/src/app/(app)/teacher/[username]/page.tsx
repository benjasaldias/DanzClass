import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TeacherProfileClient from '@/components/profile/TeacherProfileClient'
import type { Profile } from '@danceclass/shared'

interface Props {
  params: { username: string }
}

function classSessionHasEnded(cls: any, enrollmentCreatedAt: string): boolean {
  const now = new Date()
  const enrolledAt = new Date(enrollmentCreatedAt)

  if (cls.type === 'suelta') {
    if (!cls.date || !cls.time) return false
    const [h, m] = (cls.time as string).split(':').map(Number)
    const classEnd = new Date(`${cls.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
    classEnd.setMinutes(classEnd.getMinutes() + (cls.duration_minutes ?? 60))
    return classEnd < now
  }

  if (cls.recurrence === 'custom' || (cls.custom_dates && cls.custom_dates.length > 0)) {
    const time = cls.recurring_time ?? cls.time ?? '00:00'
    const [h, m] = time.split(':').map(Number)
    return (cls.custom_dates ?? []).some((d: string) => {
      const sessionEnd = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      sessionEnd.setMinutes(sessionEnd.getMinutes() + (cls.duration_minutes ?? 60))
      return sessionEnd < now && new Date(`${d}T00:00:00`) >= enrolledAt
    })
  }

  if (cls.day_of_week != null && cls.recurring_time) {
    const [h, m] = (cls.recurring_time as string).split(':').map(Number)
    const today = new Date()
    const daysBack = (today.getDay() - cls.day_of_week + 7) % 7
    const candidate = new Date(today)
    candidate.setDate(today.getDate() - (daysBack === 0 ? 7 : daysBack))
    candidate.setHours(h, m, 0, 0)
    candidate.setMinutes(candidate.getMinutes() + (cls.duration_minutes ?? 60))
    if (candidate >= now) candidate.setDate(candidate.getDate() - 7)
    return candidate < now && candidate >= enrolledAt
  }

  return false
}

export default async function UserProfilePage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawProfile } = await (supabase as any)
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .eq('is_confirmed', true)
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
    { count: classesCount },
    { count: paidSpotsCount },
    ratingsData,
    myRatingData,
    pastEnrollmentsData,
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

    // D-9/D-10: excluir clases canceladas (soft-deleted) del conteo público
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', profileUser.id)
      .in('status', ['active', 'completed']),

    supabase
      .from('enrollments')
      .select('*, class:classes!inner(*)', { count: 'exact', head: true })
      .eq('class.teacher_id', profileUser.id)
      .eq('status', 'confirmed'),

    // Ratings for this teacher (avg + count)
    (supabase as any).from('ratings').select('stars').eq('rated_user_id', profileUser.id),

    // Current user's rating for this teacher
    user && !isOwnProfile
      ? (supabase as any).from('ratings').select('stars').eq('rater_id', user.id).eq('rated_user_id', profileUser.id).maybeSingle()
      : Promise.resolve({ data: null }),

    // Past confirmed enrollments of current user in this teacher's classes (for canRate check)
    user && !isOwnProfile
      ? (supabase as any)
          .from('enrollments')
          .select('created_at, class:classes!inner(id, type, date, time, duration_minutes, recurrence, day_of_week, recurring_time, custom_dates)')
          .eq('student_id', user.id)
          .eq('status', 'confirmed')
          .eq('class.teacher_id', profileUser.id)
          .limit(20)
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

  // Compute avg stars and count
  const ratingRows: { stars: number }[] = ratingsData.data ?? []
  const ratingCount = ratingRows.length
  const avgStars = ratingCount > 0
    ? Math.round((ratingRows.reduce((sum, r) => sum + Number(r.stars), 0) / ratingCount) * 10) / 10
    : 0
  const myRating: number | null = (myRatingData.data as any)?.stars ? Number((myRatingData.data as any).stars) : null

  // canRate: confirmed enrollment in a past class with this teacher
  const pastEnrollments: any[] = (pastEnrollmentsData as any).data ?? []
  const canRate = !isOwnProfile && pastEnrollments.some((e: any) => classSessionHasEnded(e.class, e.created_at))

  // Fetch posts filtered by viewer's relationship with this profile
  const isFriendFinal = friendStatus === 'accepted'
  const isFollowingFinal = !!followData.data
  const visibilities = isOwnProfile
    ? ['public', 'followers', 'friends']
    : isFriendFinal
      ? ['public', 'followers', 'friends']
      : isFollowingFinal
        ? ['public', 'followers']
        : ['public']

  const { data: postsData } = await (supabase as any)
    .from('posts')
    .select('*, user:profiles!user_id(id, full_name, username, avatar_url)')
    .eq('user_id', profileUser.id)
    .in('visibility', visibilities)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <TeacherProfileClient
      teacher={profileUser}
      classes={classes ?? []}
      enrolledClasses={enrolledData.data ?? []}
      posts={postsData ?? []}
      followersCount={followersCount ?? 0}
      isFollowing={!!followData.data}
      currentUserId={user?.id}
      isOwnProfile={isOwnProfile}
      friendStatus={friendStatus}
      classesCount={classesCount ?? 0}
      paidSpotsCount={paidSpotsCount ?? 0}
      avgStars={avgStars}
      ratingCount={ratingCount}
      myRating={myRating}
      canRate={canRate}
    />
  )
}
