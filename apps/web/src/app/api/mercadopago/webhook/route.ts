import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionTier } from '@danceclass/shared'

function verifySignature(request: Request, rawBody: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) return false

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  const url = new URL(request.url)
  const dataId = url.searchParams.get('data.id') ?? ''

  const ts = signature.split(',').find((p) => p.startsWith('ts='))?.split('=')[1]
  const v1 = signature.split(',').find((p) => p.startsWith('v1='))?.split('=')[1]
  if (!ts || !v1) return false

  const manifest = `id=${dataId}&request-id=${requestId}&ts=${ts}`
  const computed = createHmac('sha256', secret).update(manifest).digest('hex')
  return computed === v1
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  if (!verifySignature(request, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  // MP envía distintos tipos de notificaciones; solo nos interesan pagos
  if (body.type !== 'payment') {
    return NextResponse.json({ ok: true })
  }

  const paymentId = body.data?.id
  if (!paymentId) return NextResponse.json({ ok: true })

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const paymentClient = new Payment(mp)
  const payment = await paymentClient.get({ id: paymentId })

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true })
  }

  // external_reference tiene el formato "{userId}:{tier}"
  const [userId, tier] = (payment.external_reference ?? '').split(':')
  if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  // Expirar suscripciones activas anteriores del usuario
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
    mp_subscription_id: String(payment.id),
  })

  if (error) {
    console.error('[MP webhook] supabase insert error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Sincronizar subscription_tier en profiles para acceso rápido
  await supabase.from('profiles').update({ subscription_tier: tier }).eq('id', userId)

  return NextResponse.json({ ok: true })
}
