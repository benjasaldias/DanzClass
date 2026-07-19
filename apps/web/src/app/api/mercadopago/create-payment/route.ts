import { NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveTier } from '@/lib/subscription'
import { paymentBreakdown, effectiveClassPrice } from '@danceclass/shared'
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
  if (!enrollmentId) return NextResponse.json({ error: 'enrollmentId required' }, { status: 400 })

  const admin = createAdminClient()

  // Enrollment + clase + profesor. Verifica pertenencia y estado.
  const { data: enrollment } = await (admin as any)
    .from('enrollments')
    .select('id, student_id, status, is_2x, class:classes(id, title, price, discount_price, discount_price_monthly, type, teacher_id, status)')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (!enrollment || enrollment.student_id !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (enrollment.status === 'confirmed') {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 409 })
  }
  // El split para 2x (dos alumnos, un pago) queda fuera de alcance por ahora.
  if (enrollment.is_2x) {
    return NextResponse.json({ error: 'twox_not_supported' }, { status: 400 })
  }

  const cls = enrollment.class
  if (!cls || cls.status !== 'active') {
    return NextResponse.json({ error: 'class_unavailable' }, { status: 404 })
  }

  // Cuenta MP del profesor (necesaria para el split).
  const { data: conn } = await (admin as any)
    .from('teacher_mp_connections')
    .select('access_token')
    .eq('teacher_id', cls.teacher_id)
    .maybeSingle()

  if (!conn?.access_token) {
    return NextResponse.json({ error: 'teacher_not_connected' }, { status: 400 })
  }

  // El monto es autoritativo server-side (nunca se confía en el cliente).
  // effectiveClassPrice aplica el descuento espontáneo activo del profesor,
  // si lo hay — mismo cálculo que ClassDetailClient usa para mostrar el precio.
  const tier = await getActiveTier(userId, admin as any)
  const { base, commission, total } = paymentBreakdown(effectiveClassPrice(cls), tier)
  if (base <= 0) return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Preferencia creada con el token del PROFESOR + marketplace_fee = comisión.
  const mp = new MercadoPagoConfig({ accessToken: conn.access_token })
  const preference = new Preference(mp)

  let initPoint: string | undefined
  try {
    const result = await preference.create({
      body: {
        items: [
          {
            id: `class-${cls.id}`,
            title: cls.title,
            quantity: 1,
            currency_id: 'CLP',
            unit_price: total,
          },
        ],
        marketplace_fee: commission,
        external_reference: `enrollment:${enrollmentId}`,
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

  // Registra/actualiza el pago como MP pendiente. UNIQUE(enrollment_id) → upsert.
  const { data: existing } = await (admin as any)
    .from('payments')
    .select('id')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()

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
    operation_number: null,
    mp_payment_id: null,
  }

  if (existing?.id) {
    await (admin as any).from('payments').update(paymentRow).eq('id', existing.id)
  } else {
    await (admin as any).from('payments').insert(paymentRow)
  }

  logger.info('mp_create_payment', { enrollment_id: enrollmentId, base, commission, total, tier })
  return NextResponse.json({ init_point: initPoint, breakdown: { base, commission, total } })
}
