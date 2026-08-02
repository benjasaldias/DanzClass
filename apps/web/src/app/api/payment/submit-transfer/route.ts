import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { effectiveClassPrice, paymentList, twoxClassPrice } from '@danceclass/shared'
import { getDebtSummary, resolveChargesToPay } from '@/lib/monthlyCharges'
import { receiptObjectExists } from '@/lib/receipts'
import { logger } from '@/lib/logger'

// Best-effort: dispara el escaneo IA de un comprobante (sólo corre de verdad si
// el profesor lo activó). Nunca bloquea la respuesta — la revisión manual del
// profesor es el fallback.
function triggerScan(paymentId: string): void {
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  fetch(`${appUrl}/api/payment/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  }).catch(() => {})
}

// POST /api/payment/submit-transfer  { enrollmentId, receiptPath }
//
// Registra un comprobante de transferencia. Antes este write (insert/update
// en `payments` + `enrollments`) salía directo del cliente (RLS lo permite al
// dueño del enrollment) — `classes.accepts_transfer=false` solo se hacía
// cumplir ocultando el bloque en la UI, así que una request directa a
// PostgREST podía registrar un comprobante en una clase que no acepta
// transferencias. Esta ruta cierra ese hueco (deuda anotada en
// `marketplace-payments-v2-plan.md` §8, Sesión 3) siguiendo el mismo patrón
// que `/api/mercadopago/create-payment`: el archivo se sube a Storage desde
// el cliente (necesita los bytes), pero el registro del pago y el monto
// cobrado son autoritativos server-side.
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  const rl = await checkRateLimit(`enroll:${userId}`, 'enroll')
  if (rl) return rl

  const body = await request.json().catch(() => ({}))
  const enrollmentId = (body as { enrollmentId?: string }).enrollmentId
  const receiptPath = (body as { receiptPath?: string }).receiptPath
  // Entrenamientos: el comprobante se registra contra uno o varios CARGOS
  // mensuales concretos (migración 068). Sin ids, se paga el más antiguo impago.
  const chargeIds = (body as { chargeIds?: string[] }).chargeIds
  if (!enrollmentId || !receiptPath) {
    return NextResponse.json({ error: 'enrollmentId_and_receiptPath_required' }, { status: 400 })
  }
  if (chargeIds && (!Array.isArray(chargeIds) || chargeIds.length > 24 || chargeIds.some((id) => typeof id !== 'string'))) {
    return NextResponse.json({ error: 'invalid_charge_ids' }, { status: 400 })
  }
  // El path debe vivir bajo la carpeta del propio usuario (mismo prefijo que
  // exige la policy de INSERT del bucket `payment-receipts`, migración 041).
  if (!receiptPath.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'invalid_receipt_path' }, { status: 400 })
  }

  const admin = createAdminClient()

  // …y el archivo tiene que existir de verdad (audit3 P0-1). Sin esto, un POST
  // con un nombre inventado registraba el pago: es la diferencia entre "el
  // alumno dice que pagó" y "hay un comprobante que revisar".
  if (!(await receiptObjectExists(admin, receiptPath))) {
    logger.warn('payment_receipt_missing', { user_id: userId, enrollment_id: enrollmentId, path: receiptPath })
    return NextResponse.json({ error: 'receipt_not_found' }, { status: 400 })
  }

  const { data: enrollment } = await (admin as any)
    .from('enrollments')
    .select(
      'id, student_id, status, is_2x, payment:payments(id, billing_period), class:classes(id, price, price_2x, price_suelta_2x, discount_price, discount_price_monthly, type, teacher_id, status, accepts_transfer, billing_day)'
    )
    .eq('id', enrollmentId)
    .maybeSingle()

  if (!enrollment || enrollment.student_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const cls = enrollment.class
  if (!cls || cls.status !== 'active') {
    return NextResponse.json({ error: 'class_unavailable' }, { status: 404 })
  }

  const isTraining = cls.type === 'entrenamiento'

  // Un entrenamiento cobra todos los meses: la inscripción confirmada NO
  // significa "no hay nada más que pagar" (audit.md S4). En el resto de las
  // clases sigue significándolo.
  if (!isTraining && enrollment.status === 'confirmed') {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
  }

  // El profesor decide por clase qué vías acepta (migración 061). El cliente
  // ya oculta el bloque de transferencia, pero la vía no puede depender solo
  // de la UI.
  if (cls.accepts_transfer === false) {
    return NextResponse.json({ error: 'transfer_not_accepted_for_class' }, { status: 400 })
  }

  // ── Entrenamiento: comprobante contra uno o varios cargos mensuales ───────
  //
  // Se permiten VARIOS a la vez porque una deuda de tres meses se salda con UNA
  // transferencia bancaria y UN comprobante — obligar a tres transferencias
  // separadas sólo para encajar en el modelo de datos sería obligar al alumno a
  // trabajar para la app. Cada cargo conserva su propio monto (el que se congeló
  // al emitirse) y su propia revisión; lo único que comparten es el archivo.
  //
  // El escaneo IA se SALTA cuando el comprobante cubre más de un mes: compara el
  // monto del comprobante contra `payments.amount` de una sola fila, así que un
  // comprobante por el total marcaría cada cargo como "monto no coincide". El
  // profesor lo revisa a mano, que es exactamente el fallback previsto.
  if (isTraining) {
    const billingDay = cls.billing_day ?? 1
    const debt = await getDebtSummary(admin, enrollmentId, billingDay)
    const resolved = resolveChargesToPay(debt, chargeIds)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.error === 'no_debt' ? 409 : 400 })
    }

    const charges = resolved.charges
    const totalAmount = charges.reduce((acc, c) => acc + c.amount, 0)
    const multi = charges.length > 1

    for (const charge of charges) {
      await (admin as any)
        .from('payments')
        .update({
          receipt_url: receiptPath,
          status: 'pending',
          payment_method: 'transfer',
          commission_amount: 0,
          recipient_teacher_id: cls.teacher_id,
          submitted_at: new Date().toISOString(),
          mp_payment_id: null,
          mp_status: null,
          // Un comprobante nuevo invalida cualquier escaneo anterior de esa fila.
          scan_status: multi ? 'skipped' : 'pending',
          scan_result: null,
          ai_verdict: 'none',
          confirmed_by: null,
          confirmed_at: null,
          offline_confirmed: false,
          operation_number: null,
          rejection_reason: null,
        })
        .eq('id', charge.id)
    }

    // Primer pago del alumno: la inscripción pasa a esperar revisión. Si ya está
    // confirmada (mensualidad de un alumno antiguo), NO se toca: degradarla lo
    // sacaría de la lista de alumnos del profesor por pagar un mes atrasado.
    if (enrollment.status === 'pending_payment') {
      await admin
        .from('enrollments')
        .update({ status: 'payment_submitted', hold_expires_at: null } as any)
        .eq('id', enrollmentId)
    }

    if (!multi) {
      triggerScan(charges[0].id)
    }

    logger.info('payment_submit_transfer_monthly', {
      enrollment_id: enrollmentId,
      charges: charges.length,
      periods: charges.map((c) => c.billing_period),
      amount: totalAmount,
    })
    return NextResponse.json({ ok: true, charges: charges.length, amount: totalAmount })
  }

  let price: number
  if (enrollment.is_2x) {
    const { data: req2x } = await (admin as any)
      .from('class_2x_requests')
      .select('id, payment_assignee')
      .eq('class_id', cls.id)
      .eq('status', 'matched')
      .or(`user_id.eq.${userId},matched_with.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!req2x) return NextResponse.json({ error: 'twox_not_matched' }, { status: 404 })
    if (req2x.payment_assignee !== userId) {
      return NextResponse.json({ error: 'not_payment_turn' }, { status: 403 })
    }

    const price2x = twoxClassPrice(cls)
    if (!price2x) return NextResponse.json({ error: 'twox_price_missing' }, { status: 400 })
    price = price2x
  } else {
    price = effectiveClassPrice(cls)
  }

  if (!Number.isInteger(price) || price <= 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }

  // El embed `payment:payments(*)` pasó de objeto a array al partirse el
  // UNIQUE(enrollment_id) en la migración 068. Acá interesa el pago ÚNICO de la
  // inscripción: el que no tiene período (los que sí lo tienen son cargos
  // mensuales y no llegan a esta rama).
  const existingPayment = paymentList<any>(enrollment.payment).find((p) => !p.billing_period)
  let paymentId: string | undefined = existingPayment?.id

  if (existingPayment?.id) {
    // Reenvío tras un rechazo: una imagen nueva vuelve stale cualquier escaneo
    // IA previo y cualquier dato de un intento MP anterior sobre el mismo enrollment.
    await (admin as any)
      .from('payments')
      .update({
        amount: price,
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
        commission_amount: 0,
        recipient_teacher_id: cls.teacher_id,
        // El reenvío es un comprobante NUEVO: sin refrescar la fecha, la
        // antigüedad seguía siendo la del intento rechazado (de la que dependen
        // la purga a 90 días y el aviso de comprobantes sin revisar).
        submitted_at: new Date().toISOString(),
        mp_payment_id: null,
        mp_status: null,
        scan_status: 'pending',
        scan_result: null,
        ai_verdict: 'none',
        confirmed_by: null,
        confirmed_at: null,
        operation_number: null,
      })
      .eq('id', existingPayment.id)
  } else {
    const { data: inserted } = await (admin as any)
      .from('payments')
      .insert({
        enrollment_id: enrollmentId,
        amount: price,
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
        // P2-3: sin esto, el índice antiduplicado `payments_op_dedup`
        // (recipient_teacher_id, operation_number) sólo protegía cuando el
        // escaneo IA estaba activo, porque era /api/payment/scan quien rellenaba
        // la columna. Con IA desactivada, un comprobante reutilizado pasaba.
        recipient_teacher_id: cls.teacher_id,
      })
      .select('id')
      .single()
    paymentId = inserted?.id
  }

  await admin
    .from('enrollments')
    .update({ status: 'payment_submitted', hold_expires_at: null } as any)
    .eq('id', enrollmentId)

  if (paymentId) triggerScan(paymentId)

  logger.info('payment_submit_transfer', { enrollment_id: enrollmentId, amount: price, is_2x: !!enrollment.is_2x })
  return NextResponse.json({ ok: true })
}
