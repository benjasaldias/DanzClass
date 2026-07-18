// Mercado Pago OAuth (Connect / Marketplace) — helpers server-only.
//
// Flujo: el profesor conecta su cuenta MP para poder recibir pagos in-app con
// split. `connect` lo manda a la pantalla de autorización de MP; `callback`
// intercambia el `code` por tokens y los guarda en teacher_mp_connections.
//
// El `state` se firma con HMAC (secreto = MERCADOPAGO_CLIENT_SECRET) para
// prevenir CSRF sin necesidad de almacenar nada server-side: lleva el userId +
// timestamp y se verifica firma + expiración en el callback.

import { createHmac, timingSafeEqual } from 'crypto'

const MP_AUTHORIZE_URL = 'https://auth.mercadopago.com/authorization'
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutos

export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  )
}

/** redirect_uri registrado en el panel de MP. Debe coincidir EXACTAMENTE. */
export function getRedirectUri(): string {
  return `${getAppUrl()}/api/mercadopago/oauth/callback`
}

function stateSecret(): string {
  return process.env.MERCADOPAGO_CLIENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'insecure-dev-secret'
}

/** Firma un state opaco que vincula el flujo OAuth a un userId concreto. */
export function signState(userId: string): string {
  const issuedAt = Date.now().toString()
  const payload = `${userId}.${issuedAt}`
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

/** Verifica firma + expiración; devuelve el userId o null si es inválido. */
export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return null
    const [userId, issuedAt, sig] = parts
    const expected = createHmac('sha256', stateSecret()).update(`${userId}.${issuedAt}`).digest('hex')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    if (Date.now() - Number(issuedAt) > STATE_TTL_MS) return null
    return userId
  } catch {
    return null
  }
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MERCADOPAGO_CLIENT_ID!,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: getRedirectUri(),
  })
  return `${MP_AUTHORIZE_URL}?${params.toString()}`
}

export interface MpTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  user_id: number | string
  refresh_token: string
  public_key: string
  live_mode: boolean
}

/** Intercambia el authorization code por los tokens de la cuenta MP del profesor. */
export async function exchangeCodeForToken(code: string): Promise<MpTokenResponse> {
  const res = await fetch(MP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MERCADOPAGO_CLIENT_ID,
      client_secret: process.env.MERCADOPAGO_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MP token exchange failed (${res.status}): ${text}`)
  }
  return (await res.json()) as MpTokenResponse
}
