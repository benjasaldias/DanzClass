// Vigencia del access_token de Mercado Pago Connect de cada profesor (P1-1).
//
// El callback de OAuth guardaba `refresh_token` y `expires_at` desde el día uno
// y NADIE los leía jamás. Los access tokens de MP Connect vencen (180 días en el
// estándar de MP): al vencer, `create-payment` responde 502 y el webhook no
// puede leer el pago del vendedor, así que **todos los pagos in-app de ese
// profesor dejan de funcionar en silencio** y el único remedio es que el
// profesor descubra el problema y reconecte a mano. Es una bomba con mecha
// larga: no se manifiesta en el sandbox ni en las primeras semanas, aparece
// medio año después del lanzamiento con dinero real en juego.
//
// Todo consumidor del token pasa por `getTeacherMpToken()`, que refresca de
// forma transparente cuando quedan menos de MP_TOKEN_REFRESH_WINDOW_DAYS. El
// cron diario (`/api/cron/mp-connections`) hace lo mismo de forma proactiva y
// avisa al profesor cuando el refresh falla y la conexión está por vencer.

import type { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

type AdminClient = ReturnType<typeof createAdminClient>

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

/** Margen con el que se refresca antes del vencimiento. */
export const MP_TOKEN_REFRESH_WINDOW_DAYS = 30
/** Umbral para avisarle al profesor que su conexión se está por caer. */
export const MP_TOKEN_WARN_WINDOW_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export interface MpRefreshResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  user_id?: number | string
  public_key?: string
  live_mode?: boolean
}

/** Llama a MP con `grant_type=refresh_token`. Lanza si MP responde error. */
export async function refreshMpToken(refreshToken: string): Promise<MpRefreshResponse> {
  const res = await fetch(MP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MERCADOPAGO_CLIENT_ID,
      client_secret: process.env.MERCADOPAGO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MP token refresh failed (${res.status}): ${text}`)
  }
  return (await res.json()) as MpRefreshResponse
}

export interface TeacherMpConnection {
  teacher_id: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  expiry_notified_at?: string | null
}

/** Milisegundos que le quedan al token; `null` si la fila no trae vencimiento. */
export function msUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null
  const ts = new Date(expiresAt).getTime()
  return Number.isFinite(ts) ? ts - Date.now() : null
}

/**
 * Refresca la conexión y persiste el par nuevo. Devuelve el access_token
 * vigente, o `null` si no se pudo refrescar y el token viejo ya venció.
 *
 * La escritura es condicional al `refresh_token` que se usó: si dos requests
 * entran a la vez, la segunda no pisa el resultado de la primera con un token
 * que MP ya invalidó (MP rota el refresh_token en cada uso).
 */
export async function refreshConnection(
  admin: AdminClient,
  conn: TeacherMpConnection
): Promise<{ accessToken: string | null; refreshed: boolean }> {
  const stillValid = (msUntilExpiry(conn.expires_at) ?? Infinity) > 0

  if (!conn.refresh_token) {
    // Conexión antigua sin refresh_token: no hay nada que hacer salvo avisarle
    // al profesor que reconecte antes de que venza.
    return { accessToken: stillValid ? conn.access_token : null, refreshed: false }
  }

  try {
    const tokens = await refreshMpToken(conn.refresh_token)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null

    const { error } = await (admin as any)
      .from('teacher_mp_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? conn.refresh_token,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
        ...(tokens.public_key ? { public_key: tokens.public_key } : {}),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        refresh_failed_at: null,
        expiry_notified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('teacher_id', conn.teacher_id)
      .eq('refresh_token', conn.refresh_token)

    if (error) logger.error('mp_token_refresh_persist_failed', error, { teacher_id: conn.teacher_id })

    logger.info('mp_token_refreshed', { teacher_id: conn.teacher_id, expires_at: expiresAt })
    return { accessToken: tokens.access_token, refreshed: true }
  } catch (err) {
    logger.error('mp_token_refresh_failed', err, { teacher_id: conn.teacher_id })
    await (admin as any)
      .from('teacher_mp_connections')
      .update({ refresh_failed_at: new Date().toISOString() })
      .eq('teacher_id', conn.teacher_id)

    // Otra request pudo haber refrescado con éxito mientras ésta fallaba (el
    // refresh_token de MP es de un solo uso): releer antes de darlo por perdido.
    const { data: fresh } = await (admin as any)
      .from('teacher_mp_connections')
      .select('access_token, expires_at')
      .eq('teacher_id', conn.teacher_id)
      .maybeSingle()

    if (fresh?.access_token && fresh.access_token !== conn.access_token) {
      return { accessToken: fresh.access_token, refreshed: true }
    }
    return { accessToken: stillValid ? conn.access_token : null, refreshed: false }
  }
}

/**
 * Access token vigente de la cuenta MP de un profesor, refrescándolo si está
 * por vencer. `null` si el profesor no tiene conexión o si venció sin poder
 * refrescarse (el llamador debe tratarlo como "no conectado").
 */
export async function getTeacherMpToken(
  admin: AdminClient,
  teacherId: string
): Promise<string | null> {
  const { data: conn } = await (admin as any)
    .from('teacher_mp_connections')
    .select('teacher_id, access_token, refresh_token, expires_at')
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (!conn?.access_token) return null

  const msLeft = msUntilExpiry(conn.expires_at)
  // Sin `expires_at` (fila anterior a que se guardara) no hay nada que decidir:
  // se usa tal cual y el cron se encarga de avisar.
  if (msLeft === null) return conn.access_token
  if (msLeft > MP_TOKEN_REFRESH_WINDOW_DAYS * DAY_MS) return conn.access_token

  const { accessToken } = await refreshConnection(admin, conn as TeacherMpConnection)
  return accessToken
}
