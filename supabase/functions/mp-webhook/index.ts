// Supabase Edge Function — Mercado Pago Webhook
// Deno runtime (~100ms cold start vs 1-2s en Vercel)
//
// Deploy: supabase functions deploy mp-webhook --project-ref <ref>
// Luego actualizar la URL del webhook en el dashboard de Mercado Pago a:
//   https://<ref>.supabase.co/functions/v1/mp-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!
const MP_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!

function log(level: 'info' | 'warn' | 'error', event: string, meta?: unknown) {
  console[level](JSON.stringify({ level, event, ...(meta ? { meta } : {}), ts: new Date().toISOString() }))
}

async function verifySignature(request: Request, dataId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!MP_WEBHOOK_SECRET) return { ok: false, reason: 'MERCADOPAGO_WEBHOOK_SECRET not set' }

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''

  if (!signature) return { ok: false, reason: 'x-signature header missing' }

  const ts = signature.split(',').find((p) => p.startsWith('ts='))?.split('=')[1]
  const v1 = signature.split(',').find((p) => p.startsWith('v1='))?.split('=')[1]
  if (!ts || !v1) return { ok: false, reason: `signature malformed: "${signature}"` }

  const manifest = `id=${dataId}&request-id=${requestId}&ts=${ts}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (computed !== v1) {
    return { ok: false, reason: `signature mismatch — manifest: "${manifest}"` }
  }
  return { ok: true }
}

async function mpGet(path: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  })
  if (!res.ok) throw new Error(`MP API ${path} returned ${res.status}`)
  return res.json()
}

async function activateSubscription(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: string,
  mpId: string,
  months = 1
) {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('mp_subscription_id', mpId)
    .maybeSingle()

  if (existing) {
    log('info', 'webhook:subscription_already_exists', { mp_id: mpId })
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
    tier,
    status: 'active',
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    mp_subscription_id: mpId,
  })

  if (error) {
    log('error', 'webhook:subscription_insert_failed', { error, user_id: userId, tier })
  } else {
    log('info', 'webhook:subscription_activated', { user_id: userId, tier, months })
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const rawBody = await request.text()
  const url = new URL(request.url)

  const webhookType = url.searchParams.get('type') ?? ''
  const dataId = url.searchParams.get('data.id') ?? ''

  log('info', 'webhook:received', { type: webhookType, data_id: dataId })

  if (!dataId) {
    log('warn', 'webhook:empty_data_id')
    return new Response(JSON.stringify({ error: 'Missing data.id' }), { status: 400 })
  }

  const sig = await verifySignature(request, dataId)
  if (!sig.ok) {
    log('error', 'webhook:signature_failed', sig.reason)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const eventType: string = body.type ?? webhookType
  const eventDataId: string = body.data?.id ?? dataId

  if (!eventDataId) return new Response(JSON.stringify({ ok: true }), { status: 200 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── Pago único (mensual legacy o anual) ─────────────────────────────────────
  if (eventType === 'payment') {
    try {
      const payment = await mpGet(`/v1/payments/${eventDataId}`)
      log('info', 'webhook:payment', { status: payment.status, ref: payment.external_reference })

      if (payment.status !== 'approved') return new Response(JSON.stringify({ ok: true }), { status: 200 })

      const parts = (payment.external_reference ?? '').split(':')
      const userId = parts[0]
      const tier = parts[1]
      const period = parts[2]
      const months = period === 'annual' ? 12 : 1

      if (!userId || !['basic', 'teacher', 'pro'].includes(tier)) {
        log('warn', 'webhook:invalid_external_reference', { ref: payment.external_reference })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }

      await activateSubscription(supabase, userId, tier, String(payment.id), months)
    } catch (err) {
      log('error', 'webhook:payment_error', String(err))
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // ── Suscripción recurrente — cambio de estado ────────────────────────────────
  if (eventType === 'subscription_preapproval') {
    try {
      const sub = await mpGet(`/preapproval/${eventDataId}`)
      log('info', 'webhook:preapproval', { status: sub.status, id: sub.id, ref: sub.external_reference })

      if (!sub.id) return new Response(JSON.stringify({ ok: true }), { status: 200 })

      if (sub.status === 'authorized') {
        const parts = (sub.external_reference ?? '').split(':')
        const userId = parts[0]
        const tier = parts[1]

        if (userId && ['basic', 'teacher', 'pro'].includes(tier)) {
          await activateSubscription(supabase, userId, tier, sub.id)
        }
      } else if (sub.status === 'cancelled') {
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('mp_subscription_id', sub.id)
          .in('status', ['active', 'grace'])

        log('info', 'webhook:subscription_cancelled', { sub_id: sub.id })
      } else if (sub.status === 'paused') {
        log('info', 'webhook:subscription_paused', { sub_id: sub.id })
      }
    } catch (err) {
      log('error', 'webhook:preapproval_error', String(err))
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // ── Cargo mensual de renovación ──────────────────────────────────────────────
  if (eventType === 'subscription_authorized_payment') {
    try {
      const authorizedPayment = await mpGet(`/authorized_payments/${eventDataId}`)
      const preapprovalId = authorizedPayment.preapproval_id

      log('info', 'webhook:renewal', { preapproval_id: preapprovalId, status: authorizedPayment.status })

      if (authorizedPayment.status !== 'approved' || !preapprovalId) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }

      // Idempotency check
      const { data: alreadyProcessed } = await supabase
        .from('subscription_renewals' as any)
        .select('id')
        .eq('mp_payment_id', String(eventDataId))
        .maybeSingle()

      if (alreadyProcessed) {
        log('info', 'webhook:renewal_already_processed', { mp_payment_id: eventDataId })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }

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

        await supabase
          .from('subscription_renewals' as any)
          .insert({ subscription_id: (existingSub as any).id, mp_payment_id: String(eventDataId) })

        log('info', 'webhook:subscription_renewed', { new_expiry: newExpiry.toISOString() })
      } else {
        log('warn', 'webhook:no_subscription_for_renewal', { preapproval_id: preapprovalId })
      }
    } catch (err) {
      log('error', 'webhook:renewal_error', String(err))
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  log('info', 'webhook:ignored_type', { type: eventType })
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
