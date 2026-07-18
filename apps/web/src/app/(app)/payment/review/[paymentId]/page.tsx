import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PaymentReviewClient from '@/components/payment/PaymentReviewClient'

interface Props {
  params: { paymentId: string }
}

export default async function PaymentReviewPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: payment } = await (supabase as any)
    .from('payments')
    .select(`
      id, amount, status, receipt_url, submitted_at, verified_at,
      scan_status, scan_result, ai_verdict, confirmed_by, confirmed_at, operation_number,
      enrollment:enrollments!inner(
        id, status, student_id,
        student:profiles!student_id(id, full_name, username, avatar_url),
        class:classes!inner(id, title, teacher_id)
      )
    `)
    .eq('id', params.paymentId)
    .maybeSingle()

  if (!payment || payment.enrollment?.class?.teacher_id !== user.id) notFound()

  return <PaymentReviewClient payment={payment} />
}
