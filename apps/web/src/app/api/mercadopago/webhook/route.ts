import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago'
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

async function activateSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  tier: string,
  mpId: string
) {
  // Idempotent: skip if this preapproval/payment was already processed
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('mp_subscription_id', mpId)
    .maybeSingle()

  if (existing) {
    console.log('[webhook] subscription already exists for mp_id:', mpId)
    return
  }

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
    mp_subscription_id: mpId,
  })

  if (error) {
    console.error('[webhook] supabase insert error:', error)
  } else {
    console.log('[webhook] subscription activated — user:', userId, 'tier:', tier)
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const url = new URL(request.url)

  const webhookType = url.searchParams.get('type') ?? ''
  const dataId = url.searchParams.get('data.id') ?? ''

  console.log('[MP webhook] received', { type: webhookType, dataId })

  const sig = verifySignature(request)
  if (!sig.ok) {
    console.error('[MP webhook] signature check failed:', sig.reason)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const eventType: string = body.type ?? webhookType
  const eventDataId: string = body.data?.id ?? dataId

  if (!eventDataId) return NextResponse.json({ ok: true })

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const supabase = createAdminClient()

  // ── One-time payment ────────────────────────────────────────────────────────
  if (eventType === 'payment') {
    const paymentClient = new Payment(mp)
    const payment = await paymentClient.get({ id: eventDataId })

    console.log('[webhook] payment status:', payment.status, '| ref:', payment.external_reference)

    if (payment.status !== 'approved') return NextResponse.json({ ok: true })

    const [userId, tier] = (payment.external_reference ?? '').split(':')
    if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
      return NextResponse.json({ ok: true })
    }

    await activateSubscription(supabase, userId, tier, String(payment.id))
    return NextResponse.json({ ok: true })
  }

  // ── Recurring subscription authorized ──────────────────────────────────────
  if (eventType === 'subscription_preapproval') {
    const preApproval = new PreApproval(mp)
    const sub = await preApproval.get({ id: eventDataId })

    console.log('[webhook] preapproval status:', sub.status, '| ref:', sub.external_reference)

    if (sub.status !== 'authorized' || !sub.id) return NextResponse.json({ ok: true })

    const [userId, tier] = (sub.external_reference ?? '').split(':')
    if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
      return NextResponse.json({ ok: true })
    }

    await activateSubscription(supabase, userId, tier, sub.id)
    return NextResponse.json({ ok: true })
  }

  // ── Monthly renewal charge ─────────────────────────────────────────────────
  if (eventType === 'subscription_authorized_payment') {
    // Fetch the authorized payment to get the preapproval_id
    const mpRes = await fetch(
      `https://api.mercadopago.com/authorized_payments/${eventDataId}`,
      { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } }
    )

    if (!mpRes.ok) {
      console.error('[webhook] failed to fetch authorized payment:', eventDataId)
      return NextResponse.json({ ok: true })
    }

    const authorizedPayment = await mpRes.json()
    const preapprovalId = authorizedPayment.preapproval_id

    console.log('[webhook] renewal — preapproval_id:', preapprovalId, '| status:', authorizedPayment.status)

    if (authorizedPayment.status !== 'approved' || !preapprovalId) {
      return NextResponse.json({ ok: true })
    }

    // Extend expiry by 1 month on the existing subscription
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
      console.log('[webhook] subscription renewed — new expiry:', newExpiry.toISOString())
    } else {
      console.warn('[webhook] no active subscription found for preapproval:', preapprovalId)
    }

    return NextResponse.json({ ok: true })
  }

  console.log('[MP webhook] ignoring type:', eventType)
  return NextResponse.json({ ok: true })
}
