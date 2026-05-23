import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassDetailClient from '@/components/class/ClassDetailClient'
import { getActiveTier } from '@/lib/subscription'
import type { ClassWithTeacher } from '@danceclass/shared'

interface Props {
  params: { id: string }
}

export default async function ClassDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawClass } = await supabase
    .from('classes')
    .select(`
      *,
      teacher:profiles!teacher_id(
        *,
        payment_info:teacher_payment_info(*)
      ),
      media:class_media(*)
    `)
    .eq('id', params.id)
    .single()

  if (!rawClass) notFound()

  const classData = rawClass as unknown as ClassWithTeacher

  // Fetch spots (always public)
  const { data: spots } = await supabase
    .from('class_spots')
    .select('*')
    .eq('class_id', params.id)
    .maybeSingle()

  // User-specific data — only when authenticated
  let profile = null
  let enrollment = null
  let followData = null
  let myAudition = null
  let friendsTwox: any[] = []
  let isInWaitlist = false
  const userTier = user ? await getActiveTier(user.id, supabase) : 'none'

  if (user) {
    const [profileRes, enrollmentRes, followRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('enrollments')
        .select('*, payment:payments(*)')
        .eq('class_id', params.id)
        .eq('student_id', user.id)
        .is('session_id', null)
        .maybeSingle(),
      supabase
        .from('follows')
        .select('*')
        .eq('follower_id', user.id)
        .eq('following_id', classData.teacher_id)
        .maybeSingle(),
    ])

    profile = profileRes.data
    enrollment = enrollmentRes.data
    followData = followRes.data

    // Fetch audition if entrenamiento
    if ((classData as any).type === 'entrenamiento') {
      const { data: audition } = await (supabase as any)
        .from('auditions')
        .select('*')
        .eq('class_id', params.id)
        .eq('applicant_id', user.id)
        .maybeSingle()
      myAudition = audition
    }

    // Fetch friends' active 2x requests for this class
    const { data: friendships } = await (supabase as any)
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

    const friendIds = ((friendships as any[]) ?? []).map((f: any) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )

    const { data: friendsTwoxData } = friendIds.length > 0
      ? await (supabase as any)
          .from('class_2x_requests')
          .select('*, user:profiles!user_id(username, full_name, avatar_url)')
          .in('user_id', friendIds)
          .eq('class_id', params.id)
          .eq('status', 'looking')
      : { data: [] }

    friendsTwox = (friendsTwoxData as any[]) ?? []

    // Waitlist entry
    const { data: waitlistEntry } = await (supabase as any)
      .from('waitlist')
      .select('id')
      .eq('class_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    isInWaitlist = !!waitlistEntry
  }

  return (
    <ClassDetailClient
      classData={classData}
      currentUser={user}
      currentProfile={profile}
      enrollment={enrollment}
      spots={spots}
      isFollowing={!!followData}
      myAudition={myAudition}
      friendsTwoxRequests={friendsTwox}
      isInWaitlist={isInWaitlist}
      userTier={userTier}
    />
  )
}
