import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassDetailClient from '@/components/class/ClassDetailClient'
import type { ClassWithTeacher } from '@danceclass/shared'

interface Props {
  params: { id: string }
}

export default async function ClassDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Check if already enrolled
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('*, payment:payments(*)')
    .eq('class_id', params.id)
    .eq('student_id', user.id)
    .is('session_id', null)
    .maybeSingle()

  // Get spot count
  const { data: spots } = await supabase
    .from('class_spots')
    .select('*')
    .eq('class_id', params.id)
    .maybeSingle()

  // Check if teacher follows
  const { data: followData } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', user.id)
    .eq('following_id', classData.teacher_id)
    .maybeSingle()

  // Fetch audition if entrenamiento
  let myAudition = null
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

  const { data: friendsTwox } = friendIds.length > 0
    ? await (supabase as any)
        .from('class_2x_requests')
        .select('*, user:profiles!user_id(username, full_name, avatar_url)')
        .in('user_id', friendIds)
        .eq('class_id', params.id)
        .eq('status', 'looking')
    : { data: [] }

  return (
    <ClassDetailClient
      classData={classData}
      currentUser={user}
      currentProfile={profile}
      enrollment={enrollment}
      spots={spots}
      isFollowing={!!followData}
      myAudition={myAudition}
      friendsTwoxRequests={(friendsTwox as any[]) ?? []}
    />
  )
}
