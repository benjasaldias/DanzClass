import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PaymentClient from '@/components/payment/PaymentClient'
import type { EnrollmentWithDetails } from '@danceclass/shared'

interface Props {
  params: { enrollmentId: string }
}

export default async function PaymentPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: rawEnrollment } = await supabase
    .from('enrollments')
    .select(`
      *,
      class:classes(
        *,
        teacher:profiles!teacher_id(
          *,
          payment_info:teacher_payment_info(*)
        )
      ),
      payment:payments(*)
    `)
    .eq('id', params.enrollmentId)
    .eq('student_id', user.id)
    .single()

  if (!rawEnrollment) notFound()

  const enrollment = rawEnrollment as unknown as EnrollmentWithDetails

  // Already confirmed, redirect to class
  if (enrollment.status === 'confirmed') {
    redirect(`/class/${enrollment.class_id}`)
  }

  // If 2x enrollment, fetch the related request to determine who pays
  const { data: twoxRequest } = (rawEnrollment as any).is_2x
    ? await (supabase as any)
        .from('class_2x_requests')
        .select('*')
        .eq('class_id', rawEnrollment.class_id)
        .or(`user_id.eq.${user.id},matched_with.eq.${user.id}`)
        .eq('status', 'matched')
        .maybeSingle()
    : { data: null }

  return <PaymentClient enrollment={enrollment} currentUserId={user.id} twoxRequest={twoxRequest} />
}
