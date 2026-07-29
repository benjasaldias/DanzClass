import { createAdminClient } from './supabase/admin'
import { sendPushToUsers } from './push'
import { issueAttendanceToken, revokeAttendanceToken } from './qrAttendance'
import { logger } from './logger'

type AdminClient = ReturnType<typeof createAdminClient>

// Confirma UNA inscripción: estado, token QR de asistencia y aviso al alumno.
// Extraído para poder aplicarlo también al compañero de un 2x (ver más abajo),
// donde un único pago cubre a dos alumnos con dos enrollments distintos, y a las
// clases de un paquete (un pago, N inscripciones), donde el aviso se manda una
// sola vez al final en vez de una por clase — de ahí `notify`.
export async function confirmEnrollment(
  admin: AdminClient,
  params: { enrollmentId: string; studentId: string; classId: string; classTitle: string; notify?: boolean }
): Promise<void> {
  // status='confirmed' + limpiar cualquier hold temporal (item 3): un pago
  // confirmado nunca debe quedar sujeto a expiración de reserva.
  await admin
    .from('enrollments')
    .update({ status: 'confirmed', hold_expires_at: null } as any)
    .eq('id', params.enrollmentId)

  // Emite/rota el token QR de asistencia (best-effort, no rompe la confirmación).
  await issueAttendanceToken(admin, {
    enrollmentId: params.enrollmentId,
    studentId: params.studentId,
    classId: params.classId,
  })

  if (params.notify === false) return

  await admin.from('notifications').insert({
    user_id: params.studentId,
    type: 'payment_confirmed',
    data: { class_id: params.classId },
  } as any)

  sendPushToUsers([params.studentId], {
    title: 'Pago confirmado ✅',
    body: `Tu pago para "${params.classTitle}" fue confirmado`,
    data: { type: 'payment_confirmed', class_id: params.classId },
  }).catch(() => {})
}

// Shared by /api/payment/confirm (teacher clicks "Confirmar"),
// /api/payment/scan (AI auto-confirms a 'clean' receipt when
// app_settings.auto_confirm_enabled is on) and the Mercado Pago webhook
// (in-app split payment approved) — all end in the same write + notification,
// differing only in who gets credited via `confirmed_by` and, for MP, the
// mp_payment_id/mp_status recorded on the payment.
//   - confirmedBy 'teacher' | 'ai' → revisión humana / IA de una transferencia.
//   - confirmedBy null → pago Mercado Pago (el CHECK de confirmed_by es
//     ('ai','teacher','admin'); 'mp' no aplica, así que queda null y el
//     método se distingue por payment_method='mp' + mp_payment_id).
//
// 2x: un pago 2x lo registra solo el `payment_assignee`, pero cubre a los DOS
// alumnos (cada uno con su propio enrollment, unidos por partner_enrollment_id).
// Por eso la inscripción del compañero se confirma aquí también — el llamador no
// necesita saber nada del 2x, esta función lee la relación desde la tabla.
export async function autoConfirmPayment(params: {
  paymentId: string
  enrollmentId: string
  studentId: string
  classId: string
  classTitle: string
  confirmedBy: 'teacher' | 'ai' | null
  // `feeAmount`: costo real que Mercado Pago cobró por procesar (D-2). Se
  // persiste para poder conciliar el excedente contra el tramo estimado.
  mp?: { paymentId: string; status: string; feeAmount?: number | null }
}): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // El error se revisa a propósito: `payments_mp_payment_id_key` (índice único
  // parcial, migración 053) puede rechazar la escritura si ese id de pago de MP
  // ya está asociado a otra fila. Sin este log, la inscripción quedaría
  // confirmada mientras el pago sigue en 'pending', sin rastro de por qué.
  const { error: payErr } = await (admin as any).from('payments').update({
    status: 'verified',
    verified_at: now,
    confirmed_by: params.confirmedBy,
    confirmed_at: now,
    ...(params.mp
      ? {
          mp_payment_id: params.mp.paymentId,
          mp_status: params.mp.status,
          ...(params.mp.feeAmount != null ? { mp_fee_amount: params.mp.feeAmount } : {}),
          // Un pago que MP aprueba no puede seguir marcado como cobrado fuera
          // de la app: si el profesor lo confirmó en efectivo mientras el
          // webhook venía en camino, la verdad es la de MP.
          offline_confirmed: false,
        }
      : {}),
  }).eq('id', params.paymentId)

  if (payErr) {
    logger.error('payment_confirm_write_failed', payErr, {
      paymentId: params.paymentId,
      enrollmentId: params.enrollmentId,
      mp_payment_id: params.mp?.paymentId ?? null,
    })
  }

  await confirmEnrollment(admin, {
    enrollmentId: params.enrollmentId,
    studentId: params.studentId,
    classId: params.classId,
    classTitle: params.classTitle,
  })

  await confirmTwoxPartner(admin, params.enrollmentId, params.classTitle)
}

// Revierte un pago de clase que Mercado Pago devolvió o contracargó (P2-6).
//
// Hasta ahora el webhook, tras el `approved`, sólo persistía `mp_status` en los
// eventos posteriores: el alumno podía pagar, obtener el QR de asistencia, pedir
// el reembolso y conservar el acceso. La reversión deja el pago en 'refunded'
// (fuera del Panel Financiero y de la conciliación, que filtran por 'verified')
// y le quita el acceso al alumno.
//
// Qué NO hace: cancelar la inscripción. El cupo vuelve a 'pending_payment', que
// es el estado de "reservado sin pagar" — si el alumno no vuelve a pagar, el
// barrido de reservas impagas del cron lo libera con sus reglas de siempre. Un
// cargo mensual de entrenamiento tampoco toca la inscripción: vuelve a ser deuda
// (`refunded` cuenta como impago) y el gate del QR se encarga, misma regla que
// rechazar un cargo (audit.md S4).
export async function reverseClassPayment(
  admin: AdminClient,
  payRow: { id: string; status: string; enrollment_id: string; billing_period?: string | null },
  mp: { paymentId: string; status: string; feeAmount?: number | null }
): Promise<void> {
  const isMonthly = !!payRow.billing_period

  // Sólo hay acceso que revocar si el pago llegó a valer. Un pago que nunca se
  // verificó (checkout abandonado, monto que no cuadró) sólo cambia de estado.
  const wasVerified = payRow.status === 'verified'

  await (admin as any)
    .from('payments')
    .update({
      status: 'refunded',
      mp_status: mp.status,
      mp_payment_id: mp.paymentId,
      ...(mp.feeAmount != null ? { mp_fee_amount: mp.feeAmount } : {}),
      verified_at: null,
      confirmed_by: null,
      confirmed_at: null,
    })
    .eq('id', payRow.id)

  const { data: enr } = await (admin as any)
    .from('enrollments')
    .select('student_id, class_id, status, class:classes(title, teacher_id)')
    .eq('id', payRow.enrollment_id)
    .maybeSingle()

  if (wasVerified && !isMonthly) {
    // Si la inscripción ya estaba cancelada (el alumno se salió, el profesor lo
    // sacó), no la resucitamos a 'pending_payment' por un reembolso.
    if (enr?.status === 'confirmed') {
      await admin.from('enrollments').update({ status: 'pending_payment' } as any).eq('id', payRow.enrollment_id)
    }
    await revokeAttendanceToken(admin, payRow.enrollment_id)
    await unconfirmTwoxPartner(admin, payRow.enrollment_id)
  }

  logger.warn('payment_reversed', {
    enrollment_id: payRow.enrollment_id,
    payment_id: payRow.id,
    mp_status: mp.status,
    was_verified: wasVerified,
    billing_period: payRow.billing_period ?? null,
  })

  if (!enr) return

  const classTitle = enr.class?.title ?? 'tu clase'
  const teacherId = enr.class?.teacher_id
  const notifData = {
    class_id: enr.class_id,
    mp_status: mp.status,
    billing_period: payRow.billing_period ?? null,
  }
  const rows = [
    { user_id: enr.student_id, type: 'payment_refunded', data: { ...notifData, role: 'student' } },
    ...(teacherId
      ? [{ user_id: teacherId, type: 'payment_refunded', data: { ...notifData, role: 'teacher' } }]
      : []),
  ]
  await (admin as any).from('notifications').insert(rows)

  // El profesor necesita enterarse aunque no abra la app: perdió el ingreso y el
  // alumno perdió el acceso, y puede tener que resolverlo presencialmente.
  sendPushToUsers(rows.map((r) => r.user_id), {
    title: mp.status === 'charged_back' ? 'Contracargo de Mercado Pago' : 'Pago reembolsado',
    body: `Se revirtió un pago de "${classTitle}".`,
    data: { type: 'payment_refunded', class_id: enr.class_id },
  }).catch(() => {})
}

// Inverso de `confirmTwoxPartner`: si el profesor rechaza (o revierte) el pago
// 2x, la inscripción del compañero — confirmada por ese mismo pago — no puede
// quedar confirmada. Vuelve a 'pending_payment' y se le revoca el QR.
// Best-effort: nunca rompe el rechazo del pago principal.
export async function unconfirmTwoxPartner(
  admin: AdminClient,
  enrollmentId: string
): Promise<void> {
  try {
    const { data: enr } = await (admin as any)
      .from('enrollments')
      .select('is_2x, partner_enrollment_id')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (!enr?.is_2x || !enr.partner_enrollment_id) return

    const { data: partner } = await (admin as any)
      .from('enrollments')
      .select('id, status')
      .eq('id', enr.partner_enrollment_id)
      .maybeSingle()

    // Solo revertimos lo que este pago había confirmado; si el compañero se
    // salió (cancelled) o nunca llegó a confirmarse, no hay nada que deshacer.
    if (!partner || partner.status !== 'confirmed') return

    await admin.from('enrollments').update({ status: 'pending_payment' } as any).eq('id', partner.id)
    await revokeAttendanceToken(admin, partner.id)

    logger.info('payment_2x_partner_unconfirmed', {
      enrollment_id: enrollmentId,
      partner_enrollment_id: partner.id,
    })
  } catch (err) {
    logger.error('payment_2x_partner_unconfirm_failed', err, { enrollment_id: enrollmentId })
  }
}

// Confirma la inscripción del compañero de un 2x, si esta inscripción es 2x.
// Best-effort: cualquier falla se loguea sin romper la confirmación del que pagó.
async function confirmTwoxPartner(
  admin: AdminClient,
  enrollmentId: string,
  classTitle: string
): Promise<void> {
  try {
    const { data: enr } = await (admin as any)
      .from('enrollments')
      .select('is_2x, partner_enrollment_id')
      .eq('id', enrollmentId)
      .maybeSingle()

    if (!enr?.is_2x || !enr.partner_enrollment_id) return

    const { data: partner } = await (admin as any)
      .from('enrollments')
      .select('id, student_id, class_id, status')
      .eq('id', enr.partner_enrollment_id)
      .maybeSingle()

    // Ya confirmado (reenvío del webhook, doble click del profesor) → no
    // re-notificar. Cancelado → el compañero se salió: no lo resucitamos.
    if (!partner || partner.status === 'confirmed' || partner.status === 'cancelled') return

    await confirmEnrollment(admin, {
      enrollmentId: partner.id,
      studentId: partner.student_id,
      classId: partner.class_id,
      classTitle,
    })

    logger.info('payment_2x_partner_confirmed', {
      enrollment_id: enrollmentId,
      partner_enrollment_id: partner.id,
    })
  } catch (err) {
    logger.error('payment_2x_partner_confirm_failed', err, { enrollment_id: enrollmentId })
  }
}
