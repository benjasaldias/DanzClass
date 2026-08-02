import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { revokeAttendanceToken } from '@/lib/qrAttendance'
import { notifyWaitlist } from '@/lib/waitlist'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { enrollmentId } = body as { enrollmentId?: string }
  if (!enrollmentId) return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })

  // Auth: Bearer token (mobile) or cookie (web)
  let userId: string
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const anonClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  }

  const admin = createAdminClient()

  // Verify the enrollment belongs to this user
  const { data: enrollment } = await admin
    .from('enrollments')
    .select('id, class_id, student_id, status')
    .eq('id', enrollmentId)
    .eq('student_id', userId)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })

  // Cancel enrollment
  await admin
    .from('enrollments')
    .update({ status: 'cancelled' } as any)
    .eq('id', enrollmentId)

  // Void any unresolved payment so it doesn't pollute teacher's history.
  // 'payment_submitted' never was a valid `payments.status` value (that
  // string belongs to `enrollments.status`) — this filter was a silent
  // no-op. 'due'/'rejected' matter most: they're unpaid monthly training
  // charges (068) that would otherwise survive as phantom debt if this
  // enrollment gets reactivated later (audit2.md P0-2).
  await (admin as any)
    .from('payments')
    .update({ status: 'void' })
    .eq('enrollment_id', enrollmentId)
    .in('status', ['pending', 'due', 'rejected'])

  // Revoke the attendance QR token (soft — preserves past attendance)
  await revokeAttendanceToken(admin, enrollmentId)

  // Notify the first person in the waitlist who isn't already enrolled (P1-4).
  await notifyWaitlist(admin, enrollment.class_id)

  return NextResponse.json({ ok: true })
}
