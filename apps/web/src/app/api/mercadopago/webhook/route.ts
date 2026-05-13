import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'
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

  if (computed !== v1) {
    return { ok: false, reason: `signature mismatch — manifest: "${manifest}"` }
  }
  return { ok: true }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const url = new URL(request.url)

  console.log('[MP webhook] received', {
    type: url.searchParams.get('type'),
    dataId: url.searchParams.get('data.id'),
    xSignature: request.headers.get('x-signature')?.slice(0, 30) + '...',
  })

  const sig = verifySignature(request)
  if (!sig.ok) {
    console.error('[MP webhook] signature check failed:', sig.reason)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  // MP envía distintos tipos de notificaciones; solo nos interesan pagos
  if (body.type !== 'payment') {
    console.log('[MP webhook] ignoring type:', body.type)
    return NextResponse.json({ ok: true })
  }

  const paymentId = body.data?.id
  if (!paymentId) return NextResponse.json({ ok: true })

  console.log('[MP webhook] fetching payment:', paymentId)

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const paymentClient = new Payment(mp)
  const payment = await paymentClient.get({ id: paymentId })

  console.log('[MP webhook] payment status:', payment.status, '| ref:', payment.external_reference)

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true })
  }

  // external_reference tiene el formato "{userId}:{tier}"
  const [userId, tier] = (payment.external_reference ?? '').split(':')
  if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
    console.error('[MP webhook] invalid external_reference:', payment.external_reference)
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 1)

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

  console.log('[MP webhook] subscription activated for user:', userId, 'tier:', tier)
  return NextResponse.json({ ok: true })
}
