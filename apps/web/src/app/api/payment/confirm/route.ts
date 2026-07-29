import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import { sendPushToUsers } from '@/lib/push'
import { logger } from '@/lib/logger'
import { autoConfirmPayment, unconfirmTwoxPartner } from '@/lib/payments'
import { revokeAttendanceToken } from '@/lib/qrAttendance'
import { ensureMonthlyCharges } from '@/lib/monthlyCharges'
import { effectiveClassPrice, paymentList, twoxClassPrice } from '@danceclass/shared'

type Action = 'confirm' | 'reject' | 'revert' | 'confirm_offline'
const ACTIONS: Action[] = ['confirm', 'reject', 'revert', 'confirm_offline']

const PAYMENT_SELECT = `
  id, status, confirmed_by, billing_period, receipt_url, amount, payment_method,
  enrollment:enrollments!inner(id, status, student_id, is_2x,
    class:classes!inner(id, teacher_id, title, type, price, price_2x,
      price_suelta_2x, discount_price, discount_price_monthly))
`

// Teacher-facing endpoint: confirms, rejects, or reverts (undoes an AI
// auto-confirmation of) a single payment. The client never writes to
// `payments`/`enrollments` directly for this flow — this route is the only
// place that validates the transition and performs the write.
//
// `confirm_offline` (audit.md S4-5) registra un pago recibido FUERA de la app
// (efectivo, transferencia directa que el alumno no subió). Es la ruta más
// fácil de abusar del sistema de cobro, así que deja rastro explícito:
// `offline_confirmed = true`, `confirmed_by = 'teacher'`, `receipt_url = null`,
// y el historial la muestra marcada como tal. También es la alternativa que
// cierra P1-8: el botón "Confirmar" del profesor deja de escribir `enrollments`
// desde el navegador (lo que dejaba al alumno confirmado SIN token QR) y pasa
// por acá, que sí emite el QR y registra el pago.
export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const body = await request.json().catch(() => ({}))
  const { paymentId, enrollmentId, action } = body as {
    paymentId?: string
    enrollmentId?: string
    action?: Action
  }

  if (!ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: 'a valid action is required' }, { status: 400 })
  }
  // `confirm_offline` puede llegar sin pago existente (el alumno nunca subió
  // nada): en ese caso identifica la inscripción y el pago se crea acá.
  if (!paymentId && !(action === 'confirm_offline' && enrollmentId)) {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  }

  const limitHit = await checkRateLimit(`payment_confirm:${userId}`, 'notif')
  if (limitHit) return limitHit

  const admin = createAdminClient()

  let payment: any = null

  if (paymentId) {
    const { data } = await (admin as any).from('payments').select(PAYMENT_SELECT).eq('id', paymentId).maybeSingle()
    payment = data
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  } else {
    // confirm_offline por inscripción: se busca el cargo impago más antiguo
    // (entrenamiento) o el pago único; si no hay ninguno, se crea abajo.
    const { data: enr } = await (admin as any)
      .from('enrollments')
      .select(`
        id, status, student_id, is_2x,
        payment:payments(id, status, confirmed_by, billing_period, receipt_url, amount),
        class:classes!inner(id, teacher_id, title, type, price, price_2x,
          price_suelta_2x, discount_price, discount_price_monthly)
      `)
      .eq('id', enrollmentId)
      .maybeSingle()

    if (!enr) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
    if (enr.class?.teacher_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (enr.class.type === 'entrenamiento') await ensureMonthlyCharges(admin, enr.id)

    const { data: rows } = await (admin as any)
      .from('payments')
      .select('id, status, confirmed_by, billing_period, receipt_url, amount')
      .eq('enrollment_id', enr.id)
      // Mismos estados que cuenta como deuda `summarizeCharges` (shared):
      // 'refunded' entra porque Mercado Pago devolvió el dinero y el mes volvió
      // a estar impago — el alumno puede saldarlo en efectivo.
      .in('status', ['due', 'rejected', 'refunded'])
      .order('billing_period', { ascending: true, nullsFirst: true })

    const target = paymentList<any>(rows)[0]
    const { payment: _drop, ...enrollment } = enr
    payment = target ? { ...target, enrollment } : { id: null, enrollment }
  }

  const enrollment = payment.enrollment
  const cls = enrollment?.class
  if (!cls || cls.teacher_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Un cargo mensual de entrenamiento no gobierna el estado de la inscripción:
  // el alumno queda inscrito de forma permanente y lo único que cambia con el
  // pago es su acceso por QR (audit.md S4). Por eso rechazar o revertir un
  // cargo NO devuelve la inscripción a `pending_payment` ni revoca el token:
  // hacerlo expulsaría de la clase a un alumno de dos años por un comprobante
  // borroso de este mes.
  const isMonthly = !!payment.billing_period
  const classTitle = cls.title ?? 'una clase'
  const now = new Date().toISOString()

  // P2-1: un pago por Mercado Pago no lo confirma ni lo rechaza el profesor —
  // lo resuelve MP y lo escribe el webhook. Una fila `mp` en 'pending' significa
  // que el alumno abrió el checkout y no lo completó: el dinero no llegó, así
  // que confirmarla sería regalar la clase, y rechazarla le avisaría al alumno
  // que "su pago fue rechazado" sin que haya pagado nada. La UI no expone el
  // botón en ese caso; esto cierra el camino por API.
  //
  // Si el profesor cobró en efectivo, el camino correcto es `confirm_offline`,
  // que convierte la fila y deja rastro (más abajo).
  if (payment.payment_method === 'mp' && (action === 'confirm' || action === 'reject')) {
    return NextResponse.json(
      { error: 'mp_payment_not_reviewable' },
      { status: 409 }
    )
  }

  // ── confirm_offline ───────────────────────────────────────────────────────
  if (action === 'confirm_offline') {
    if (payment.id && payment.status === 'verified') {
      return NextResponse.json({ error: 'Payment is already confirmed' }, { status: 409 })
    }
    // Con comprobante subido esperando revisión, el camino correcto es
    // 'confirm': así el historial no dice "sin comprobante" sobre un pago que sí
    // lo tiene.
    if (payment.id && payment.receipt_url) {
      return NextResponse.json({ error: 'Payment has a receipt — use confirm' }, { status: 409 })
    }

    let targetId: string | null = payment.id
    if (!targetId) {
      // Sin fila previa: pago único que el alumno nunca registró. El monto es el
      // vigente de la clase (mismo cálculo que usaría la pantalla de pago).
      const amount = enrollment.is_2x
        ? twoxClassPrice(cls) ?? effectiveClassPrice(cls)
        : effectiveClassPrice(cls)
      if (!Number.isInteger(amount) || amount <= 0) {
        return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
      }
      const { data: inserted, error: insErr } = await (admin as any)
        .from('payments')
        .insert({
          enrollment_id: enrollment.id,
          amount,
          status: 'due',
          payment_method: 'transfer',
          commission_amount: 0,
          recipient_teacher_id: userId,
          receipt_url: null,
          scan_status: 'skipped',
          ai_verdict: 'none',
        })
        .select('id')
        .single()
      if (insErr || !inserted) {
        logger.error('payment_offline_insert_failed', insErr?.message ?? 'no row', { enrollmentId: enrollment.id })
        return NextResponse.json({ error: 'could_not_register_payment' }, { status: 500 })
      }
      targetId = inserted.id
    }

    // El pago entró fuera de Mercado Pago: si la fila venía de un checkout MP
    // abandonado, dejarla como `mp` haría que la conciliación tributaria contara
    // una comisión de servicio que nadie cobró (el split nunca ocurrió).
    await (admin as any).from('payments').update({
      offline_confirmed: true,
      payment_method: 'transfer',
      commission_amount: 0,
      mp_payment_id: null,
      mp_status: null,
      mp_fee_amount: null,
    }).eq('id', targetId)

    await autoConfirmPayment({
      paymentId: targetId!,
      enrollmentId: enrollment.id,
      studentId: enrollment.student_id,
      classId: cls.id,
      classTitle,
      confirmedBy: 'teacher',
    })

    logger.warn('payment_confirmed_offline', {
      paymentId: targetId,
      teacherId: userId,
      enrollmentId: enrollment.id,
      billing_period: payment.billing_period ?? null,
    })

    return NextResponse.json({ ok: true, paymentId: targetId, paymentStatus: 'verified' })
  }

  if (action === 'confirm' || action === 'reject') {
    if (payment.status !== 'pending') {
      return NextResponse.json({ error: 'Payment is not awaiting review' }, { status: 409 })
    }

    if (action === 'confirm') {
      await autoConfirmPayment({
        paymentId: payment.id,
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        classId: cls.id,
        classTitle,
        confirmedBy: 'teacher',
      })
      return NextResponse.json({ ok: true, paymentStatus: 'verified', enrollmentStatus: 'confirmed' })
    }

    await admin.from('payments').update({
      status: isMonthly ? 'due' : 'rejected',
      verified_at: null,
      confirmed_by: 'teacher',
      confirmed_at: now,
    } as any).eq('id', payment.id)

    if (!isMonthly) {
      await admin.from('enrollments').update({ status: 'pending_payment' } as any).eq('id', enrollment.id)
      // Enrollment ya no está confirmado → revoca el token QR (defensa en profundidad).
      await revokeAttendanceToken(admin, enrollment.id)
      // 2x: un solo pago confirma a los dos; al rechazarlo, tampoco puede quedar
      // confirmado el compañero.
      await unconfirmTwoxPartner(admin, enrollment.id)
    }

    await admin.from('notifications').insert({
      user_id: enrollment.student_id,
      type: 'payment_rejected',
      data: { class_id: cls.id, billing_period: payment.billing_period ?? null },
    } as any)

    sendPushToUsers([enrollment.student_id], {
      title: 'Pago rechazado',
      body: `Tu pago para "${classTitle}" fue rechazado`,
      data: { type: 'payment_rejected', class_id: cls.id },
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      // El cargo mensual rechazado vuelve a ser deuda ('due'), no queda en un
      // estado terminal: el alumno tiene que poder resubir el comprobante.
      paymentStatus: isMonthly ? 'due' : 'rejected',
      enrollmentStatus: isMonthly ? enrollment.status : 'pending_payment',
    })
  }

  // action === 'revert' — undo an AI auto-confirmation, sending the payment back for manual review.
  if (payment.confirmed_by !== 'ai' || payment.status !== 'verified') {
    return NextResponse.json({ error: 'Only an AI-confirmed payment can be reverted' }, { status: 409 })
  }

  await admin.from('payments').update({
    status: 'pending',
    verified_at: null,
    confirmed_by: null,
    confirmed_at: null,
  } as any).eq('id', payment.id)

  if (!isMonthly) {
    await admin.from('enrollments').update({ status: 'payment_submitted' } as any).eq('id', enrollment.id)
    // Enrollment ya no está confirmado → revoca el token QR (defensa en profundidad).
    await revokeAttendanceToken(admin, enrollment.id)
    await unconfirmTwoxPartner(admin, enrollment.id)
  }

  logger.warn('payment_ai_confirmation_reverted', { paymentId: payment.id, teacherId: userId, enrollmentId: enrollment.id })

  return NextResponse.json({
    ok: true,
    paymentStatus: 'pending',
    enrollmentStatus: isMonthly ? enrollment.status : 'payment_submitted',
  })
}
