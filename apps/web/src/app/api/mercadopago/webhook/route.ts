import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoConfirmPayment } from '@/lib/payments'
import { rewardReferralIfNeeded } from '@/lib/referral'
import { logger } from '@/lib/logger'
import type { SubscriptionTier } from '@danceclass/shared'

function verifySignature(request: Request): { ok: boolean; reason?: string } {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) return { ok: false, reason: 'MERCADOPAGO_WEBHOOK_SECRET not set' }

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  const url = new URL(request.url)
  const dataId = url.searchParams.get('data.id') ?? ''

  if (!signature) return { ok: false, reason: 'x-signature header missing' }

  const ts = signature.split(',').find((p) => p.startsWith('ts='))?.split('=')[1]
  const v1 = signature.split(',').find((p) => p.startsWith('v1='))?.split('=')[1]
  if (!ts || !v1) return { ok: false, reason: `signature malformed: "${signature}"` }

  const manifest = `id=${dataId}&request-id=${requestId}&ts=${ts}`
  const computed = createHmac('sha256', secret).update(manifest).digest('hex')

  // Constant-time comparison to avoid leaking the HMAC via response-timing.
  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(v1, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: `signature mismatch — manifest: "${manifest}"` }
  }
  return { ok: true }
}

async function activateSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  tier: string,
  mpId: string,
  months = 1
) {
  // Idempotente: no duplicar si este pago/preapproval ya fue procesado
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('mp_subscription_id', mpId)
    .maybeSingle()

  if (existing) {
    logger.info('webhook:subscription_already_exists', { mp_id: mpId })
    return
  }

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + months)

  await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .in('status', ['active', 'grace'])

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    tier: tier as Exclude<SubscriptionTier, 'none'>,
    status: 'active',
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    mp_subscription_id: mpId,
  })

  if (error) {
    logger.error('webhook:subscription_insert_failed', error, { user_id: userId, tier })
  } else {
    logger.info('webhook:subscription_activated', { user_id: userId, tier, months })
  }
}

// Confirma (o actualiza el estado de) un pago de clase in-app por Mercado Pago.
// external_reference = 'enrollment:<enrollmentId>'. Idempotente ante reenvíos.
async function confirmClassPayment(
  supabase: ReturnType<typeof createAdminClient>,
  payment: any,
  ref: string
): Promise<void> {
  const enrollmentId = ref.split(':')[1]
  if (!enrollmentId) return

  const mpPaymentId = String(payment.id)
  const mpStatus = String(payment.status)

  // El pago se registró como 'pending' en create-payment (UNIQUE por enrollment).
  const { data: payRow } = await (supabase as any)
    .from('payments')
    .select('id, status, mp_payment_id, amount, commission_amount')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()

  if (!payRow) {
    logger.warn('webhook:class_payment_no_row', { enrollment_id: enrollmentId })
    return
  }

  // Aún no aprobado (pending/in_process/rejected/…): solo persistir el estado MP.
  if (payment.status !== 'approved') {
    await (supabase as any).from('payments').update({ mp_status: mpStatus }).eq('id', payRow.id)
    logger.info('webhook:class_payment_not_approved', { enrollment_id: enrollmentId, mp_status: mpStatus })
    return
  }

  // Idempotencia: ya confirmado con este mismo pago → no re-notificar.
  if (payRow.status === 'verified' && payRow.mp_payment_id === mpPaymentId) {
    logger.info('webhook:class_payment_already_confirmed', { enrollment_id: enrollmentId })
    return
  }

  // P1-3: defensa en profundidad — verificar que el monto aprobado por MP
  // coincida con lo esperado (base + comisión). El monto lo fija create-payment
  // server-side, así que un desajuste indica manipulación o inconsistencia:
  // no auto-confirmamos, dejamos la fila para revisión manual del profesor.
  const expectedTotal = Math.round((payRow.amount ?? 0) + (payRow.commission_amount ?? 0))
  const paidAmount = Math.round(Number(payment.transaction_amount ?? 0))
  if (expectedTotal > 0 && paidAmount !== expectedTotal) {
    logger.error('webhook:class_payment_amount_mismatch', `paid ${paidAmount} != expected ${expectedTotal}`, {
      enrollment_id: enrollmentId,
      mp_payment_id: mpPaymentId,
    })
    await (supabase as any)
      .from('payments')
      .update({ mp_status: mpStatus, mp_payment_id: mpPaymentId })
      .eq('id', payRow.id)
    return
  }

  // Datos del alumno/clase para la notificación.
  const { data: enr } = await (supabase as any)
    .from('enrollments')
    .select('student_id, class_id, class:classes(title)')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (!enr) {
    logger.warn('webhook:class_payment_no_enrollment', { enrollment_id: enrollmentId })
    return
  }

  // Escritura + notificación compartida (mismo camino que confirm/scan), con
  // confirmed_by=null (es pago MP) + mp_payment_id/mp_status.
  await autoConfirmPayment({
    paymentId: payRow.id,
    enrollmentId,
    studentId: enr.student_id,
    classId: enr.class_id,
    classTitle: enr.class?.title ?? 'tu clase',
    confirmedBy: null,
    mp: { paymentId: mpPaymentId, status: mpStatus },
  })

  logger.info('webhook:class_payment_confirmed', { enrollment_id: enrollmentId, mp_payment_id: mpPaymentId })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const url = new URL(request.url)

  const webhookType = url.searchParams.get('type') ?? ''
  const dataId = url.searchParams.get('data.id') ?? ''

  logger.info('webhook:received', { type: webhookType, data_id: dataId })

  // Reject events with no data.id before signature check (prevents manifest spoofing)
  if (!dataId) {
    logger.warn('webhook:empty_data_id')
    return NextResponse.json({ error: 'Missing data.id' }, { status: 400 })
  }

  const sig = verifySignature(request)
  if (!sig.ok) {
    logger.error('webhook:signature_failed', sig.reason)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const eventType: string = body.type ?? webhookType
  const eventDataId: string = body.data?.id ?? dataId

  if (!eventDataId) return NextResponse.json({ ok: true })

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const supabase = createAdminClient()

  // ── Pago único ──────────────────────────────────────────────────────────────
  // Cubre dos casos según de qué cuenta MP proviene el pago:
  //   * Pago de CLASE (marketplace/split): vive en la cuenta MP del PROFESOR.
  //     create-payment fija notification_url=...?seller=<teacherId>, así leemos
  //     el pago con el access_token del profesor. external_reference='enrollment:<id>'.
  //   * Pago de SUSCRIPCIÓN (mensual legacy o anual): cuenta de la plataforma.
  if (eventType === 'payment') {
    const sellerId = url.searchParams.get('seller')

    // Elegir el token correcto para leer el pago.
    let paymentMp = mp
    if (sellerId) {
      const { data: conn } = await (supabase as any)
        .from('teacher_mp_connections')
        .select('access_token')
        .eq('teacher_id', sellerId)
        .maybeSingle()
      if (conn?.access_token) {
        paymentMp = new MercadoPagoConfig({ accessToken: conn.access_token })
      } else {
        logger.warn('webhook:seller_not_connected', { seller: sellerId })
      }
    }

    let payment: any
    try {
      payment = await new Payment(paymentMp).get({ id: eventDataId })
    } catch (err) {
      // No responder 500: MP reintentaría en loop. Logueamos y devolvemos 200.
      logger.error('webhook:payment_fetch_failed', err, { data_id: eventDataId, seller: sellerId })
      return NextResponse.json({ ok: true })
    }

    const ref: string = payment.external_reference ?? ''
    logger.info('webhook:payment', { status: payment.status, ref, seller: sellerId })

    // ── Pago de clase (marketplace) ──
    if (ref.startsWith('enrollment:')) {
      await confirmClassPayment(supabase, payment, ref)
      return NextResponse.json({ ok: true })
    }

    // ── Pago de suscripción ──
    if (payment.status !== 'approved') return NextResponse.json({ ok: true })

    const parts = ref.split(':')
    const userId = parts[0]
    const tier = parts[1]
    const period = parts[2] // 'annual' o undefined
    const months = period === 'annual' ? 12 : 1

    if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
      logger.warn('webhook:invalid_external_reference', { ref })
      return NextResponse.json({ ok: true })
    }

    await activateSubscription(supabase, userId, tier, String(payment.id), months)
    // Premio de referido (idempotente): no depende de que el referido cargue
    // /plans/success. Ver lib/referral.ts.
    await rewardReferralIfNeeded(supabase, userId).catch((e) =>
      logger.error('webhook:referral_reward_failed', e, { user_id: userId })
    )
    return NextResponse.json({ ok: true })
  }

  // ── Suscripción recurrente — cambio de estado ────────────────────────────────
  if (eventType === 'subscription_preapproval') {
    const preApproval = new PreApproval(mp)
    const sub = await preApproval.get({ id: eventDataId })

    logger.info('webhook:preapproval', { status: sub.status, id: sub.id, ref: sub.external_reference })

    if (!sub.id) return NextResponse.json({ ok: true })

    if (sub.status === 'authorized') {
      const parts = (sub.external_reference ?? '').split(':')
      const userId = parts[0]
      const tier = parts[1]

      if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
        return NextResponse.json({ ok: true })
      }

      await activateSubscription(supabase, userId, tier, sub.id)
      await rewardReferralIfNeeded(supabase, userId).catch((e) =>
        logger.error('webhook:referral_reward_failed', e, { user_id: userId })
      )

    } else if (sub.status === 'cancelled') {
      // Cancelada desde MP (usuario canceló directo, o demasiados fallos de cobro)
      // El acceso se mantiene hasta expires_at (comportamiento igual al cancel manual)
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('mp_subscription_id', sub.id)
        .in('status', ['active', 'grace'])

      logger.info('webhook:subscription_cancelled', { sub_id: sub.id })

    } else if (sub.status === 'paused') {
      // MP pausa tras cobro fallido; reintentará. No tocamos el estado en BD:
      // el expires_at natural actúa de grace period. Solo logueamos.
      logger.info('webhook:subscription_paused', { sub_id: sub.id })
    }

    return NextResponse.json({ ok: true })
  }

  // ── Cargo mensual de renovación ──────────────────────────────────────────────
  if (eventType === 'subscription_authorized_payment') {
    const mpRes = await fetch(
      `https://api.mercadopago.com/authorized_payments/${eventDataId}`,
      { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } }
    )

    if (!mpRes.ok) {
      logger.error('webhook:renewal_fetch_failed', `HTTP ${mpRes.status}`, { event_data_id: eventDataId })
      return NextResponse.json({ ok: true })
    }

    const authorizedPayment = await mpRes.json()
    const preapprovalId = authorizedPayment.preapproval_id

    logger.info('webhook:renewal', { preapproval_id: preapprovalId, status: authorizedPayment.status })

    if (authorizedPayment.status !== 'approved' || !preapprovalId) {
      return NextResponse.json({ ok: true })
    }

    // Idempotency: skip if this mp_payment_id was already processed
    const { data: alreadyProcessed } = await (supabase as any)
      .from('subscription_renewals')
      .select('id')
      .eq('mp_payment_id', String(eventDataId))
      .maybeSingle()

    if (alreadyProcessed) {
      logger.info('webhook:renewal_already_processed', { mp_payment_id: eventDataId })
      return NextResponse.json({ ok: true })
    }

    // Extender expires_at en 1 mes
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id, expires_at')
      .eq('mp_subscription_id', String(preapprovalId))
      .in('status', ['active', 'grace'])
      .maybeSingle()

    if (existingSub) {
      const newExpiry = new Date(existingSub.expires_at)
      newExpiry.setMonth(newExpiry.getMonth() + 1)
      await supabase
        .from('subscriptions')
        .update({ expires_at: newExpiry.toISOString(), status: 'active' })
        .eq('id', (existingSub as any).id)

      // Record the processed renewal to prevent future duplicates
      await (supabase as any)
        .from('subscription_renewals')
        .insert({ subscription_id: (existingSub as any).id, mp_payment_id: String(eventDataId) })

      logger.info('webhook:subscription_renewed', { new_expiry: newExpiry.toISOString() })
    } else {
      logger.warn('webhook:no_subscription_for_renewal', { preapproval_id: preapprovalId })
    }

    return NextResponse.json({ ok: true })
  }

  logger.info('webhook:ignored_type', { type: eventType })
  return NextResponse.json({ ok: true })
}
