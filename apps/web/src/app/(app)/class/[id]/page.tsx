import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassDetailClient from '@/components/class/ClassDetailClient'

interface Props {
  params: { id: string }
}

export default async function ClassDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: classData } = await supabase
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

  if (!classData) notFound()

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

  return (
    <ClassDetailClient
      classData={classData}
      currentUser={user}
      currentProfile={profile}
      enrollment={enrollment}
      spots={spots}
      isFollowing={!!followData}
    />
  )
}
