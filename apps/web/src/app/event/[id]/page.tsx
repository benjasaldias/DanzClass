import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EventDetailClient from '@/components/event/EventDetailClient'

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: { user } }, { data: event }] = await Promise.all([
    supabase.auth.getUser(),
    (supabase as any)
      .from('events')
      .select(`
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url),
        event_invites(
          id, status,
          teacher:profiles!teacher_id(id, username, full_name, avatar_url)
        ),
        event_enrollments(id, user_id, status)
      `)
      .eq('id', params.id)
      .single(),
  ])

  if (!event) notFound()

  // Fetch payment info of creator (for entry fee events)
  let creatorPaymentInfo: any = null
  if (event.has_entry && user) {
    const { data } = await supabase
      .from('teacher_payment_info')
      .select('bank, account_type, account_number, rut, account_holder')
      .eq('user_id', event.creator_id)
      .maybeSingle()
    creatorPaymentInfo = data
  }

  // Fetch current user's enrollment if logged in
  let myEnrollment: any = null
  let myPayment: any = null
  if (user) {
    const { data: enroll } = await (supabase as any)
      .from('event_enrollments')
      .select('id, status')
      .eq('event_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    myEnrollment = enroll

    if (enroll) {
      const { data: pay } = await (supabase as any)
        .from('event_payments')
        .select('id, status, receipt_url, amount')
        .eq('enrollment_id', enroll.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      myPayment = pay
    }
  }

  return (
    <EventDetailClient
      event={event}
      currentUser={user ?? null}
      creatorPaymentInfo={creatorPaymentInfo}
      myEnrollment={myEnrollment}
      myPayment={myPayment}
    />
  )
}
