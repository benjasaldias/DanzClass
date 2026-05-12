import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PaymentClient from '@/components/payment/PaymentClient'

interface Props {
  params: { enrollmentId: string }
}

export default async function PaymentPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: enrollment } = await supabase
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

  if (!enrollment) notFound()

  // Already confirmed, redirect to class
  if (enrollment.status === 'confirmed') {
    redirect(`/class/${enrollment.class_id}`)
  }

  return <PaymentClient enrollment={enrollment} currentUserId={user.id} />
}
