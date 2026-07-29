import { NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTeacherMpToken } from '@/lib/mercadopago/token'
import { getActiveTier } from '@/lib/subscription'
import { paymentBreakdown, effectiveClassPrice, formatBillingPeriod, twoxClassPrice } from '@danceclass/shared'
import { getDebtSummary, resolveChargesToPay } from '@/lib/monthlyCharges'
import { deleteReceiptObject } from '@/lib/receipts'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

// POST /api/mercadopago/create-payment  { enrollmentId }
// Crea una preferencia de Checkout Pro con SPLIT: el pago se crea con el
// access_token del profesor (cuenta MP conectada) y marketplace_fee = comisión,
// de modo que MP liquida al profe el precio de la clase y a DanzClass la comisión.
// Registra el pago como payment_method='mp', status='pending' (lo confirma el
// webhook cuando MP aprueba — Fase 4).
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  const rl = await checkRateLimit(`enroll:${userId}`, 'enroll')
  if (rl) return rl

  const body = await request.json().catch(() => ({}))
  const enrollmentId = (body as { enrollmentId?: string }).enrollmentId
  // Entrenamiento: el checkout cubre UN cargo mensual. Sin id, el más antiguo
  // impago. A diferencia de la transferencia, MP no acepta varios meses en un
  // solo checkout: el `marketplace_fee` y la validación de monto del webhook se
  // calculan contra UNA fila de `payments`, y repartir un pago único de MP entre
  // varias filas exigiría un vínculo nuevo entre pago y cargos. Con MP cada mes
  // es un checkout instantáneo, así que el costo para el alumno es bajo.
  const chargeId = (body as { chargeId?: string }).chargeId
  if (!enrollmentId) return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })

  const admin = createAdminClient()

  // Enrollment + clase + profesor. Verifica pertenencia y estado.
  const { data: enrollment } = await (admin as any)
    .from('enrollments')
    .select('id, student_id, status, is_2x, class:classes(id, title, price, price_2x, price_suelta_2x, discount_price, discount_price_monthly, type, teacher_id, status, accepts_mp, billing_day)')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (!enrollment || enrollment.student_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const cls = enrollment.class
  if (!cls || cls.status !== 'active') {
    return NextResponse.json({ error: 'class_unavailable' }, { status: 404 })
  }

  // Un entrenamiento cobra todos los meses: estar confirmado no significa que no
  // quede nada por pagar (audit.md S4).
  const isTraining = cls.type === 'entrenamiento'
  if (!isTraining && enrollment.status === 'confirmed') {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
  }

  // El profesor decide por clase qué vías acepta (migración 061). El cliente ya
  // oculta el botón, pero la vía no puede depender solo de la UI.
  if (cls.accepts_mp === false) {
    return NextResponse.json({ error: 'mp_not_accepted_for_class' }, { status: 400 })
  }

  // Cuenta MP del profesor (necesaria para el split). El helper refresca el
  // token si está por vencer: sin eso, a los 180 días de conectarse el profesor
  // dejaba de poder cobrar in-app sin que nadie se enterara (P1-1).
  const accessToken = await getTeacherMpToken(admin, cls.teacher_id)
  if (!accessToken) {
    return NextResponse.json({ error: 'teacher_not_connected' }, { status: 400 })
  }

  // El monto es autoritativo server-side (nunca se confía en el cliente).
  //   * Clase individual: effectiveClassPrice aplica el descuento espontáneo
  //     activo del profesor, si lo hay — mismo cálculo que usa ClassDetailClient
  //     para mostrar el precio.
  //   * 2x: un único pago (el del payment_assignee) cubre a los dos alumnos, y
  //     usa el precio 2x propio de la clase, sin descuento espontáneo.
  let price: number
  // Cargo mensual: el monto es el que se congeló al emitirlo, no el precio de
  // hoy — la deuda de un mes pasado no se reprecia (ver migración 068).
  let monthlyCharge: { id: string; billing_period: string; amount: number } | null = null
  if (isTraining) {
    const debt = await getDebtSummary(admin, enrollmentId, cls.billing_day ?? 1)
    const resolved = resolveChargesToPay(debt, chargeId ? [chargeId] : null)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.error === 'no_debt' ? 409 : 400 })
    }
    monthlyCharge = resolved.charges[0]
    price = monthlyCharge.amount
  } else if (enrollment.is_2x) {
    // Solo quien tiene el turno de pago puede iniciar el cobro; el otro debe
    // pedir el turno con /api/class-2x/transfer-payment.
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
    // Sin precio 2x configurado no hay monto que cobrar: cobrar el individual
    // sería cobrarle a uno lo que cubre a dos. El alumno debe hablar con el
    // profesor (la pantalla de pago ya muestra ese aviso).
    if (!price2x) return NextResponse.json({ error: 'twox_price_missing' }, { status: 400 })
    price = price2x
  } else {
    price = effectiveClassPrice(cls)
  }

  // `total` incluye el gross-up del costo de procesamiento de MP, de modo que
  // tras el descuento de MP queden `base` para el profesor y `commission` para
  // DanzClass (que MP transfiere vía marketplace_fee). El profesor nunca
  // absorbe la comisión de MP. Ver packages/shared/src/lib/commission.ts.
  const tier = await getActiveTier(userId, admin as any)
  const { base, commission, total } = paymentBreakdown(price, tier, 'mp')
  if (base <= 0) return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })

  // Pago único ya existente de esta inscripción (los cargos mensuales vienen
  // resueltos en `monthlyCharge`). Se busca ANTES de crear la preferencia para
  // no dejar una preferencia viva sobre un pago que no corresponde tocar.
  let existing: { id: string; status: string; receipt_url: string | null } | null = null
  if (!monthlyCharge) {
    const { data } = await (admin as any)
      .from('payments')
      .select('id, status, receipt_url')
      .eq('enrollment_id', enrollmentId)
      .is('billing_period', null)
      .maybeSingle()
    existing = data ?? null
  }
  // Defensa en profundidad: el guard de `already_confirmed` de más arriba mira
  // el enrollment; éste mira el pago. Sobrescribir una fila 'verified' con un
  // 'pending' de MP borraría un cobro ya cerrado.
  if (existing?.status === 'verified') {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
  }

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Preferencia creada con el token del PROFESOR + marketplace_fee = comisión.
  const mp = new MercadoPagoConfig({ accessToken })
  const preference = new Preference(mp)

  let initPoint: string | undefined
  try {
    const result = await preference.create({
      body: {
        items: [
          {
            id: monthlyCharge ? `class-${cls.id}-${monthlyCharge.billing_period}` : `class-${cls.id}`,
            title: monthlyCharge
              ? `${cls.title} — ${formatBillingPeriod(monthlyCharge.billing_period)}`
              : cls.title,
            quantity: 1,
            currency_id: 'CLP',
            unit_price: total,
          },
        ],
        marketplace_fee: commission,
        // `payment:<id>` apunta al CARGO exacto que se está pagando: con varios
        // pagos por inscripción (migración 068), `enrollment:<id>` ya no
        // identifica una fila. El webhook sigue entendiendo el formato viejo
        // para las preferencias que quedaron en vuelo al desplegar.
        external_reference: monthlyCharge
          ? `payment:${monthlyCharge.id}`
          : `enrollment:${enrollmentId}`,
        back_urls: {
          success: `${appUrl}/class/${cls.id}?mp=ok`,
          pending: `${appUrl}/class/${cls.id}?mp=pending`,
          failure: `${appUrl}/payment/${enrollmentId}?mp=failed`,
        },
        auto_return: 'approved',
        // El `seller` permite al webhook (Fase 4) leer el pago del split con el
        // access_token del profesor correcto (el pago vive en su cuenta MP, no en
        // la de la plataforma). No afecta la firma del webhook (usa data.id/ts).
        notification_url: `${appUrl}/api/mercadopago/webhook?seller=${cls.teacher_id}`,
      },
    })
    initPoint = result.init_point ?? result.sandbox_init_point ?? undefined
  } catch (err) {
    logger.error('mp_create_payment_failed', err, { enrollment_id: enrollmentId })
    return NextResponse.json({ error: 'mp_error' }, { status: 502 })
  }

  if (!initPoint) return NextResponse.json({ error: 'mp_error' }, { status: 502 })

  // Registra/actualiza el pago como MP pendiente.
  //   * Cargo mensual: la fila YA existe (la emitió generate_monthly_charges);
  //     se actualiza esa, conservando su `billing_period`.
  //   * Pago único: como máximo hay una fila sin período por inscripción
  //     (índice parcial `payments_one_per_enrollment`), así que se busca esa.
  const paymentRow = {
    enrollment_id: enrollmentId,
    amount: base, // lo que recibe el profesor (el panel Financiero suma esto)
    commission_amount: commission,
    payment_method: 'mp',
    status: 'pending',
    recipient_teacher_id: cls.teacher_id,
    mp_status: 'pending',
    // MP no usa comprobante ni escaneo IA.
    receipt_url: null,
    scan_status: 'skipped',
    scan_result: null,
    ai_verdict: 'none',
    confirmed_by: null,
    confirmed_at: null,
    offline_confirmed: false,
    operation_number: null,
    mp_payment_id: null,
  }

  const existingId: string | undefined = monthlyCharge?.id ?? existing?.id

  if (existingId) {
    await (admin as any).from('payments').update(paymentRow).eq('id', existingId)
  } else {
    await (admin as any).from('payments').insert(paymentRow)
  }

  // P2-2: el alumno subió un comprobante y después eligió Mercado Pago. La fila
  // de pago acaba de quedar con `receipt_url: null`, así que hay que cerrar las
  // dos puntas que quedaban sueltas:
  //   1. El archivo queda huérfano en el bucket privado (nadie lo referencia y
  //      nadie lo borra: el cron sólo purga los comprobantes de una clase al
  //      archivarla).
  //   2. La inscripción seguía en 'payment_submitted', así que el profesor veía
  //      "Revisar pago" sobre un pago sin comprobante que revisar.
  if (existing?.receipt_url) {
    await deleteReceiptObject(admin, existing.receipt_url)
  }
  if (enrollment.status === 'payment_submitted') {
    await admin
      .from('enrollments')
      .update({ status: 'pending_payment' } as any)
      .eq('id', enrollmentId)
  }

  logger.info('mp_create_payment', {
    enrollment_id: enrollmentId,
    base, commission, total, tier,
    is_2x: !!enrollment.is_2x,
    billing_period: monthlyCharge?.billing_period ?? null,
  })
  return NextResponse.json({ init_point: initPoint, breakdown: { base, commission, total } })
}
