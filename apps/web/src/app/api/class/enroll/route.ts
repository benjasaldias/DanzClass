import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { classId } = body as { classId?: string }
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 })

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

  // Rate limit: max 10 enroll attempts per minute per user
  const enrollLimit = await checkRateLimit(`enroll:${userId}`, 'enroll')
  if (enrollLimit) return enrollLimit

  // Inscripción abierta a cualquier usuario autenticado (marketplace, 2026-07-17):
  // los alumnos SIN plan también pueden inscribirse y pagan in-app por Mercado
  // Pago con comisión. El tier solo decide el método/comisión, ya en la pantalla
  // de pago — no bloquea la inscripción.

  const admin = createAdminClient()

  // Verify class exists and is active
  const { data: classData } = await (admin as any)
    .from('classes')
    .select('id, teacher_id, title, status, price, type, date, ends_at, ends_indefinitely, requires_audition, audition_closed, allow_late_payment')
    .eq('id', classId)
    .eq('status', 'active')
    .maybeSingle()

  if (!classData) return NextResponse.json({ error: 'Clase no encontrada o no disponible' }, { status: 404 })

  // Item 3 — reserva con lock temporal. Si la clase NO permite pagos atrasados,
  // el cupo se reserva por 10 minutos (hold_expires_at); si el alumno no concreta
  // el pago (comprobante o MP) antes de que expire, el cupo se libera solo (la
  // vista class_spots deja de contar holds vencidos) y el cron limpia la fila.
  const requiresHold = classData.allow_late_payment === false
  const HOLD_MS = 10 * 60 * 1000
  const holdExpiresAt = requiresHold ? new Date(Date.now() + HOLD_MS).toISOString() : null

  // Rate limit de reservas: 10/día por (usuario, clase). Solo para clases con
  // lock — evita que alguien mantenga un cupo bloqueado re-reservando en loop.
  if (requiresHold) {
    const reserveLimit = await checkRateLimit(`reserve:${userId}:${classId}`, 'reserve')
    if (reserveLimit) return reserveLimit
  }

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

  // Check for existing enrollment (including cancelled). `hold_expires_at` es
  // columna de la migración 055 aún no reflejada en database.ts → cast a any.
  const { data: existingRows } = await (admin as any)
    .from('enrollments')
    .select('id, status, hold_expires_at')
    .eq('student_id', userId)
    .eq('class_id', classId)
    .is('session_id', null)

  const existing = ((existingRows ?? []) as any[])[0] ?? null

  // Un hold vencido (pending_payment con hold_expires_at ya pasado) ya no ocupa
  // cupo: se trata como una inscripción libre para re-reservar (sujeta al rate
  // limit de reservas ya aplicado arriba).
  const isExpiredHold =
    !!existing &&
    existing.status === 'pending_payment' &&
    !!existing.hold_expires_at &&
    new Date(existing.hold_expires_at) < new Date()

  const isReactivatable = !!existing && (existing.status === 'cancelled' || isExpiredHold)

  let enrollment: any

  if (existing && !isReactivatable) {
    // Already has an active enrollment (pending vigente, submitted, confirmed).
    // Devolvemos el id + estado para que el cliente lleve al pago si corresponde
    // (P1-4) en vez de quedarse sin feedback.
    return NextResponse.json({ error: 'already_enrolled', enrollmentId: existing.id, status: existing.status }, { status: 409 })
  } else if (isReactivatable) {
    // Re-enroll after cancellation OR expired hold: back to pending_payment
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
      .update({ status: 'pending_payment', hold_expires_at: holdExpiresAt } as any)
      .eq('id', existing.id)
      .select('*, payment:payments(*)')
      .single()
    if (updateErr || !updated) {
      // El trigger de capacidad (056) rechaza si la clase se llenó en la carrera.
      if ((updateErr as any)?.message?.includes('class_full')) {
        return NextResponse.json({ error: 'no_spots' }, { status: 409 })
      }
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
      .insert({ student_id: userId, class_id: classId, session_id: null, status: 'pending_payment', hold_expires_at: holdExpiresAt } as any)
      .select('*, payment:payments(*)')
      .single()
    if (insertErr || !inserted) {
      // Índice único parcial (056): otra request ganó la carrera e insertó primero.
      if ((insertErr as any)?.code === '23505') {
        const { data: race } = await (admin as any)
          .from('enrollments')
          .select('id, status')
          .eq('student_id', userId)
          .eq('class_id', classId)
          .is('session_id', null)
          .neq('status', 'cancelled')
          .maybeSingle()
        return NextResponse.json({ error: 'already_enrolled', enrollmentId: race?.id, status: race?.status }, { status: 409 })
      }
      // El trigger de capacidad (056) rechaza si la clase se llenó en la carrera.
      if ((insertErr as any)?.message?.includes('class_full')) {
        return NextResponse.json({ error: 'no_spots' }, { status: 409 })
      }
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

  return NextResponse.json({
    enrollment,
    hold_expires_at: holdExpiresAt,
    allow_late_payment: classData.allow_late_payment !== false,
  })
}
