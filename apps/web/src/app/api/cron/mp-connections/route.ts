import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { markMpDisconnected } from '@/lib/mercadopago/connection'
import {
  MP_TOKEN_REFRESH_WINDOW_DAYS,
  MP_TOKEN_WARN_WINDOW_DAYS,
  msUntilExpiry,
  refreshConnection,
  type TeacherMpConnection,
} from '@/lib/mercadopago/token'
import { sendPushToUsers } from '@/lib/push'
import { logger } from '@/lib/logger'

// Vercel Cron, diario a las 07:00 UTC. Mantiene vivas las conexiones de Mercado
// Pago de los profesores (P1-1 del audit).
//
// Los access tokens de MP Connect vencen a los 180 días. `getTeacherMpToken()`
// ya refresca bajo demanda, pero eso solo ocurre cuando ALGUIEN intenta pagar:
// un profesor con poco movimiento puede pasar meses sin que nadie toque su
// token y descubrir el vencimiento justo cuando un alumno intenta pagarle. Este
// cron lo refresca antes de que pase, y —cuando el refresh no es posible— avisa
// al profesor mientras todavía queda tiempo de reconectar.
//
// Si la conexión ya venció y no se pudo refrescar, se la marca como
// desconectada: es la verdad (no puede recibir pagos in-app) y dispara la misma
// reparación de clases que la desconexión manual, para que sus alumnos con pago
// pendiente no queden sin ninguna vía (P2-4).

export const runtime = 'nodejs'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
/** No repetir el aviso todos los días: una vez cada 7. */
const RENOTIFY_AFTER_DAYS = 7

async function pingHealthcheck(uuid: string | undefined) {
  if (!uuid) return
  try {
    await fetch(`https://hc-ping.com/${uuid}`, { signal: AbortSignal.timeout(5000) })
  } catch {
    // non-critical
  }
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    logger.error('mp-connections', 'CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const errors: string[] = []

  // Conexiones que entran en la ventana de refresco (y las que ya vencieron).
  const horizon = new Date(Date.now() + MP_TOKEN_REFRESH_WINDOW_DAYS * DAY_MS).toISOString()
  const { data: conns, error: listErr } = await (admin as any)
    .from('teacher_mp_connections')
    .select('teacher_id, access_token, refresh_token, expires_at, expiry_notified_at')
    .not('expires_at', 'is', null)
    .lt('expires_at', horizon)
    .limit(500)

  if (listErr) {
    logger.error('mp-connections:list_failed', listErr.message)
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  let refreshed = 0
  let warned = 0
  let disconnected = 0
  const renotifyCutoff = Date.now() - RENOTIFY_AFTER_DAYS * DAY_MS

  for (const conn of ((conns as TeacherMpConnection[]) ?? [])) {
    try {
      const { accessToken, refreshed: ok } = await refreshConnection(admin, conn)
      if (ok) {
        refreshed++
        continue
      }

      const msLeft = msUntilExpiry(conn.expires_at) ?? 0
      const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS))

      // Venció y no hay forma de recuperarlo sin que el profesor reconecte.
      // Sólo se marca (y se reparan sus clases) la primera vez: si no, cada
      // corrida volvería a "desconectar" a un profesor ya desconectado y a
      // pisarle la configuración de vías de pago de sus clases todos los días.
      if (!accessToken) {
        const { data: prof } = await (admin as any)
          .from('profiles').select('mp_connected').eq('id', conn.teacher_id).maybeSingle()
        if (prof?.mp_connected) {
          const summary = await markMpDisconnected(admin, conn.teacher_id, { deleteTokens: false })
          disconnected++
          logger.warn('mp-connections:expired', { teacher_id: conn.teacher_id, ...summary })
        }
      } else if (msLeft > MP_TOKEN_WARN_WINDOW_DAYS * DAY_MS) {
        // Falló el refresh pero todavía queda margen: se reintenta mañana sin
        // molestar al profesor por algo que probablemente se arregle solo.
        continue
      }

      const lastNotified = conn.expiry_notified_at ? new Date(conn.expiry_notified_at).getTime() : 0
      if (lastNotified > renotifyCutoff) continue

      const { error: notifErr } = await (admin as any).from('notifications').insert({
        user_id: conn.teacher_id,
        type: 'mp_connection_expiring',
        data: { days_left: daysLeft, expired: !accessToken },
      })
      if (notifErr) {
        errors.push(`notify(${conn.teacher_id}): ${notifErr.message}`)
        continue
      }

      await (admin as any)
        .from('teacher_mp_connections')
        .update({ expiry_notified_at: new Date().toISOString() })
        .eq('teacher_id', conn.teacher_id)

      warned++
      await sendPushToUsers([conn.teacher_id], {
        title: accessToken ? 'Tu conexión con Mercado Pago está por vencer' : 'Se desconectó tu cuenta de Mercado Pago',
        body: accessToken
          ? `Reconéctala en los próximos ${daysLeft} días para seguir recibiendo pagos in-app.`
          : 'Vuelve a conectarla para seguir recibiendo pagos in-app.',
        data: { type: 'mp_connection_expiring' },
      }).catch(() => {})
    } catch (e) {
      errors.push(`${conn.teacher_id}: ${(e as Error).message}`)
    }
  }

  logger.info('mp-connections:done', { checked: (conns ?? []).length, refreshed, warned, disconnected, errors: errors.length })
  await pingHealthcheck(process.env.HEALTHCHECK_MP_CONNECTIONS_UUID)

  return NextResponse.json({ checked: (conns ?? []).length, refreshed, warned, disconnected, errors })
}
