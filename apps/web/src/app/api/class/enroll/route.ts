import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { getActiveTier } from '@/lib/subscription'
import { canEnroll } from '@danceclass/shared'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { classId } = body as { classId?: string }
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 })

  // Auth: Bearer token (mobile) or cookie (web)
  let userId: string
  let supabaseForTier: any

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
    supabaseForTier = anonClient
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    supabaseForTier = supabase
  }

  // Rate limit: max 10 enroll attempts per minute per user
  const enrollLimit = await checkRateLimit(`enroll:${userId}`, 'enroll')
  if (enrollLimit) return enrollLimit

  // Check subscription tier (includes grace period via getActiveTier)
  const tier = await getActiveTier(userId, supabaseForTier)
  if (!canEnroll(tier)) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Verify class exists and is active
  const { data: classData } = await (admin as any)
    .from('classes')
    .select('id, teacher_id, title, status, price, type, date, ends_at, ends_indefinitely, requires_audition, audition_closed')
    .eq('id', classId)
    .eq('status', 'active')
    .maybeSingle()

  if (!classData) return NextResponse.json({ error: 'Clase no encontrada o no disponible' }, { status: 404 })

  // Validate class is not expired
  const today = new Date().toISOString().split('T')[0]
  if (classData.type === 'suelta') {
    if (classData.date && classData.date < today) {
      return NextResponse.json({ error: 'class_expired' }, { status: 400 })
    }
  } else if (!classData.ends_indefinitely && classData.ends_at && classData.ends_at < today) {
    return NextResponse.json({ error: 'class_expired' }, { status: 400 })
  }

  // For classes requiring audition, verify the student was accepted
  if (classData.requires_audition) {
    const { data: audition } = await (admin as any)
      .from('auditions')
      .select('status')
      .eq('class_id', classId)
      .eq('applicant_id', userId)
      .maybeSingle()
    if (!audition || audition.status !== 'accepted') {
      return NextResponse.json({ error: 'audition_required' }, { status: 403 })
    }
  }

  // Prevent teacher from enrolling in own class
  if (classData.teacher_id === userId) {
    return NextResponse.json({ error: 'No puedes inscribirte en tu propia clase' }, { status: 403 })
  }

  // Check available spots via class_spots view
  const { data: spotsData } = await (admin as any)
    .from('class_spots')
    .select('spots_available')
    .eq('class_id', classId)
    .maybeSingle()
  const spotsAvailable = spotsData?.spots_available ?? 0

  // Check for existing enrollment (including cancelled)
  const { data: existingRows } = await admin
    .from('enrollments')
    .select('id, status')
    .eq('student_id', userId)
    .eq('class_id', classId)
    .is('session_id', null)

  const existing = (existingRows ?? [])[0] ?? null

  let enrollment: any

  if (existing && existing.status !== 'cancelled') {
    // Already has an active enrollment (pending, submitted, confirmed)
    return NextResponse.json({ error: 'already_enrolled' }, { status: 409 })
  } else if (existing && existing.status === 'cancelled') {
    // Re-enroll after cancellation: update cancelled row back to pending_payment
    if (spotsAvailable <= 0) {
      return NextResponse.json({ error: 'no_spots' }, { status: 409 })
    }
    // Void any stale payments from the previous enrollment so teacher history stays clean
    await (admin as any)
      .from('payments')
      .update({ status: 'void' })
      .eq('enrollment_id', existing.id)
      .not('status', 'in', '("confirmed","void")')

    const { data: updated, error: updateErr } = await admin
      .from('enrollments')
      .update({ status: 'pending_payment' } as any)
      .eq('id', existing.id)
      .select('*, payment:payments(*)')
      .single()
    if (updateErr || !updated) {
      return NextResponse.json({ error: 'Error al reinscribir' }, { status: 500 })
    }
    enrollment = updated
  } else {
    // Fresh enrollment
    if (spotsAvailable <= 0) {
      return NextResponse.json({ error: 'no_spots' }, { status: 409 })
    }
    const { data: inserted, error: insertErr } = await admin
      .from('enrollments')
      .insert({ student_id: userId, class_id: classId, session_id: null, status: 'pending_payment' } as any)
      .select('*, payment:payments(*)')
      .single()
    if (insertErr || !inserted) {
      return NextResponse.json({ error: 'Error al inscribir' }, { status: 500 })
    }
    enrollment = inserted
  }

  // Debt check: notify teacher if student has unpaid pending_payment from past sueltas for this teacher
  const { data: debts } = await (admin as any)
    .from('enrollments')
    .select('id, class:classes!inner(id, teacher_id, date, type)')
    .eq('student_id', userId)
    .eq('status', 'pending_payment')
    .neq('id', enrollment.id)

  const hasDebt = (debts as any[] ?? []).some((e: any) => {
    const c = e.class
    return c?.teacher_id === classData.teacher_id && c?.type === 'suelta' && c?.date && c.date < today
  })

  if (hasDebt) {
    const { data: sp } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
    await admin.from('notifications').insert({
      user_id: classData.teacher_id,
      type: 'debt_warning',
      data: { student_id: userId, student_name: sp?.username ?? userId, class_id: classId },
    } as any)
  }

  return NextResponse.json({ enrollment })
}
