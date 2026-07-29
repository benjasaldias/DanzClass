import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import { verifyAttendanceToken } from '@/lib/qrAttendance'
import { logger } from '@/lib/logger'
import { summarizeCharges } from '@danceclass/shared'

// Endpoint que valida un QR de asistencia escaneado por el PROFESOR y registra
// la asistencia (migración 054). El profesor escanea → manda { token } (el
// string opaco que porta el QR) → esta ruta verifica firma, propiedad de la
// clase, pago confirmado y fecha, e inserta una fila en `attendance`.
//
// Convención de respuesta: union discriminada, SIEMPRE HTTP 200 salvo
// 400 (token ausente/oversized), 401 (sin auth), 429 (rate limit). Cada
// rechazo de negocio va como 200 { status:'rejected', reason } para que el
// scanner renderice una tarjeta por motivo sin parsear códigos HTTP. Datos del
// alumno solo se devuelven en confirmed/already_registered (nunca en rechazos).

type RejectReason =
  | 'invalid_signature'
  | 'wrong_class'
  | 'revoked'
  | 'payment_not_confirmed'
  | 'debt_overdue'
  | 'class_inactive'
  | 'out_of_date'

const REJECT_MESSAGES: Record<RejectReason, string> = {
  invalid_signature: 'QR inválido o no reconocido.',
  wrong_class: 'Este QR pertenece a una clase de otro profesor.',
  revoked: 'El código fue revocado (el alumno se desinscribió).',
  payment_not_confirmed: 'La inscripción no tiene el pago confirmado.',
  debt_overdue: 'El alumno tiene mensualidades vencidas.',
  class_inactive: 'La clase ya no está activa.',
  out_of_date: 'Hoy no corresponde una sesión de esta clase.',
}

function reject(reason: RejectReason, extra?: Record<string, unknown>) {
  return NextResponse.json({ status: 'rejected', reason, message: REJECT_MESSAGES[reason], ...extra })
}

// Fecha de hoy en Chile (YYYY-MM-DD). en-CA emite formato ISO.
function todayInChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// ¿Corresponde registrar asistencia HOY? (estrictez "lenient", ver plan):
// - suelta: hoy debe ser exactamente su fecha.
// - resto (periódica/entrenamiento/custom): se acepta hoy mientras la clase
//   ya haya iniciado y no esté vencida. El profesor está presente escaneando.
function isValidCheckinDate(cls: any, todayYMD: string): boolean {
  if (cls.type === 'suelta') return cls.date === todayYMD

  // No iniciada aún
  if (cls.start_date && cls.start_date > todayYMD) return false

  // Vencida (misma lógica que el feed/explore)
  const now = new Date()
  const durationMs = (cls.duration_minutes ?? 60) * 60 * 1000
  if (cls.recurrence === 'custom' || cls.custom_dates?.length) {
    const dates: string[] = cls.custom_dates ?? []
    if (dates.length) {
      const last = [...dates].sort().at(-1)!
      const [h = 0, m = 0] = (cls.recurring_time ?? cls.time ?? '00:00').split(':').map(Number)
      const [y, mo, d] = last.split('-').map(Number)
      const end = new Date(y, mo - 1, d, h, m)
      end.setTime(end.getTime() + durationMs)
      if (end < now) return false
    }
    return true
  }
  // periódica / entrenamiento
  if (cls.ends_indefinitely) return true
  if (!cls.ends_at) return true
  const [h = 0, m = 0] = (cls.recurring_time ?? '00:00').split(':').map(Number)
  const [y, mo, d] = cls.ends_at.split('-').map(Number)
  const end = new Date(y, mo - 1, d, h, m)
  end.setTime(end.getTime() + durationMs)
  return end >= now
}

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const teacherId = authed.user.id

  const limitHit = await checkRateLimit(`attendance:${teacherId}`, 'social')
  if (limitHit) return limitHit

  const body = await request.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token || token.length > 512) {
    return NextResponse.json({ error: 'token requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Lookup por token (índice UNIQUE) + joins.
  const { data: row } = await (admin as any)
    .from('qr_tokens')
    .select(`
      id, token, nonce, status, enrollment_id, student_id, class_id,
      enrollment:enrollments!inner(id, status),
      class:classes!inner(id, teacher_id, title, type, status, date, time,
        recurrence, custom_dates, start_date, day_of_week, recurring_time,
        duration_minutes, ends_at, ends_indefinitely, billing_day),
      student:profiles!student_id(id, full_name, username, avatar_url)
    `)
    .eq('token', token)
    .maybeSingle()

  if (!row) return reject('invalid_signature')

  // 1b. Firma HMAC (secreto actual, tiempo constante).
  if (!verifyAttendanceToken({
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    nonce: row.nonce,
    token: row.token,
  })) {
    return reject('invalid_signature')
  }

  const cls = row.class
  const enrollment = row.enrollment

  // 2. Propiedad de la clase — antes de revelar estado del token o PII.
  if (!cls || cls.teacher_id !== teacherId) return reject('wrong_class')

  // 3. Token activo (no revocado).
  if (row.status !== 'active') return reject('revoked')

  // 4. Pago al día.
  //
  // ENTRENAMIENTO (audit.md S4): el alumno queda inscrito de forma permanente
  // tras la audición y su inscripción nunca se cancela por impago, así que
  // `status === 'confirmed'` dejó de ser la señal de "está al día" — un alumno
  // confirmado hace ocho meses puede deber los últimos tres. La condición pasa
  // a ser NO TENER MENSUALIDADES VENCIDAS: es la única consecuencia del impago
  // que define el modelo, y por eso se evalúa acá y no en el estado de la fila.
  // Un cargo con comprobante ya enviado ('pending') no bloquea: el alumno hizo
  // su parte y el retraso es de la revisión del profesor (ver summarizeCharges).
  //
  // RESTO DE CLASES: sin cambios — un pago único confirmado es el gate.
  if (cls.type === 'entrenamiento') {
    if (enrollment?.status === 'cancelled') return reject('payment_not_confirmed')

    const { data: charges } = await (admin as any)
      .from('payments')
      .select('id, billing_period, amount, status')
      .eq('enrollment_id', row.enrollment_id)
      .not('billing_period', 'is', null)

    const debt = summarizeCharges((charges ?? []) as any, cls.billing_day ?? 1)

    // Sin ningún cargo emitido todavía, el gate vuelve a ser el estado de la
    // inscripción: es el alumno recién aceptado que aún no pagó su primer mes.
    if (debt.charges.length === 0 && enrollment?.status !== 'confirmed') {
      return reject('payment_not_confirmed')
    }
    if (debt.hasOverdue) {
      return reject('debt_overdue', {
        debt: {
          months: debt.overdue.length,
          total: debt.totalOverdue,
          periods: debt.overdue.map((c) => c.billing_period),
        },
      })
    }
  } else if (enrollment?.status !== 'confirmed') {
    return reject('payment_not_confirmed')
  }

  // 5. Clase vigente.
  if (cls.status !== 'active') return reject('class_inactive')

  // 6. Fecha de sesión (hoy en Chile).
  const sessionDate = todayInChile()
  if (!isValidCheckinDate(cls, sessionDate)) return reject('out_of_date')

  const student = row.student
    ? {
        id: row.student.id,
        full_name: row.student.full_name,
        username: row.student.username,
        avatar_url: row.student.avatar_url,
      }
    : null

  // 7. Registro idempotente. La UNIQUE(qr_token_id, session_date) es el guard
  // contra doble escaneo / race: si otro request ya insertó hoy, cae en 23505
  // → devolvemos already_registered leyendo la fila existente (no es error).
  const { data: inserted, error: insErr } = await (admin as any)
    .from('attendance')
    .insert({
      qr_token_id: row.id,
      student_id: row.student_id,
      class_id: row.class_id,
      session_date: sessionDate,
      checked_in_by: teacherId,
    })
    .select('checked_in_at')
    .single()

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: existing } = await (admin as any)
        .from('attendance')
        .select('checked_in_at')
        .eq('qr_token_id', row.id)
        .eq('session_date', sessionDate)
        .maybeSingle()
      return NextResponse.json({
        status: 'already_registered',
        student,
        class_title: cls.title,
        session_date: sessionDate,
        checked_in_at: existing?.checked_in_at ?? null,
      })
    }
    logger.error('attendance_insert_failed', insErr, { qrTokenId: row.id, teacherId })
    return NextResponse.json({ error: 'No se pudo registrar la asistencia' }, { status: 500 })
  }

  return NextResponse.json({
    status: 'confirmed',
    student,
    class_title: cls.title,
    session_date: sessionDate,
    checked_in_at: inserted?.checked_in_at ?? null,
  })
}
