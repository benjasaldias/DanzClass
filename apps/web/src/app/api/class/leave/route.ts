import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { revokeAttendanceToken } from '@/lib/qrAttendance'
import { notifyUsers } from '@/lib/notifyUsers'

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

  // Void any pending/submitted payment so it doesn't pollute teacher's history
  await (admin as any)
    .from('payments')
    .update({ status: 'void' })
    .eq('enrollment_id', enrollmentId)
    .in('status', ['pending', 'payment_submitted'])

  // Revoke the attendance QR token (soft — preserves past attendance)
  await revokeAttendanceToken(admin, enrollmentId)

  // Notify first user in waitlist (if any)
  const { data: classInfo } = await admin
    .from('classes')
    .select('id, title')
    .eq('id', enrollment.class_id)
    .maybeSingle()

  const { data: waitlistEntry } = await (admin as any)
    .from('waitlist')
    .select('user_id')
    .eq('class_id', enrollment.class_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (waitlistEntry && classInfo) {
    await notifyUsers(admin, [{
      user_id: waitlistEntry.user_id,
      type: 'waitlist_available',
      data: {
        class_id: classInfo.id,
        class_title: classInfo.title,
        spots_available: 1,
      },
    }])
  }

  return NextResponse.json({ ok: true })
}
