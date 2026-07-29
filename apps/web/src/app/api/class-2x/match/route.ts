import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  let user: any = null

  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const mobileSupa = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await mobileSupa.auth.getUser()
    user = data.user
  }
  if (!user) {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rlHit = await checkRateLimit(`enroll:${user.id}`, 'enroll')
  if (rlHit) return rlHit

  const { request_id } = await req.json()
  if (!request_id) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch the 2x request
  const { data: request, error: reqErr } = await admin
    .from('class_2x_requests' as any)
    .select('*, class:classes(*)')
    .eq('id', request_id)
    .eq('status', 'looking')
    .single()

  if (reqErr || !request) {
    return NextResponse.json({ error: 'Request not found or already matched' }, { status: 404 })
  }

  const req2x = request as any
  if (req2x.user_id === user.id) {
    return NextResponse.json({ error: 'Cannot match with yourself' }, { status: 400 })
  }

  // Check neither is already enrolled
  const { data: existingEnrollments } = await admin
    .from('enrollments')
    .select('id, student_id')
    .eq('class_id', req2x.class_id)
    .in('student_id', [req2x.user_id, user.id])
    .in('status', ['pending_payment', 'payment_submitted', 'confirmed'])

  if (existingEnrollments && existingEnrollments.length > 0) {
    return NextResponse.json({ error: 'One of you is already enrolled' }, { status: 400 })
  }

  // Create enrollment for requester (A) - they pay by default
  const { data: enrollA, error: errA } = await admin
    .from('enrollments')
    .insert({
      student_id: req2x.user_id,
      class_id: req2x.class_id,
      session_id: null,
      status: 'pending_payment',
      is_2x: true,
    })
    .select()
    .single()

  if (errA || !enrollA) {
    return NextResponse.json({ error: 'Failed to create enrollment A' }, { status: 500 })
  }

  // Create enrollment for matcher (B)
  const { data: enrollB, error: errB } = await admin
    .from('enrollments')
    .insert({
      student_id: user.id,
      class_id: req2x.class_id,
      session_id: null,
      status: 'pending_payment',
      is_2x: true,
      partner_enrollment_id: enrollA.id,
    })
    .select()
    .single()

  if (errB || !enrollB) {
    await admin.from('enrollments').delete().eq('id', enrollA.id)
    return NextResponse.json({ error: 'Failed to create enrollment B' }, { status: 500 })
  }

  // Link A's enrollment to B
  await admin.from('enrollments').update({ partner_enrollment_id: enrollB.id }).eq('id', enrollA.id)

  // Update 2x request to matched.
  // El error NO se puede ignorar: si esta escritura falla, el emparejamiento
  // queda sin turno de pago y ni transfer-payment ni el pago por Mercado Pago
  // funcionan (así se descubrió que `payment_assignee` nunca se había creado
  // en la tabla — ver migración 062).
  const { error: matchErr } = await admin
    .from('class_2x_requests' as any)
    .update({
      matched_with: user.id,
      status: 'matched',
      payment_assignee: req2x.user_id, // requester pays by default
    })
    .eq('id', request_id)

  if (matchErr) {
    logger.error('twox_match_update_failed', matchErr, { request_id, class_id: req2x.class_id })
    await admin.from('enrollments').delete().in('id', [enrollA.id, enrollB.id])
    return NextResponse.json({ error: 'Failed to match' }, { status: 500 })
  }

  // Notify requester (A) that B matched
  await notifyUsers(admin, [{
    user_id: req2x.user_id,
    type: '2x_match',
    data: {
      class_id: req2x.class_id,
      class_title: req2x.class?.title ?? '',
      matched_with: user.id,
      enrollment_id: enrollA.id,
    },
  }])

  return NextResponse.json({ success: true, enrollment_id: enrollA.id })
}
