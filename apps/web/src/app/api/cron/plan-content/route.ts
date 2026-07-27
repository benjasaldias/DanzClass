import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteCloudinaryAssets } from '@/lib/cloudinary-admin'
import { sendPushToUsers } from '@/lib/push'
import { logger } from '@/lib/logger'
import { PLAN_HIDDEN_RETENTION_DAYS } from '@danceclass/shared'

// Vercel Cron, diario a las 05:00 UTC.
//
// Mantiene alineado el contenido con el plan pagado (ver 060_post_plan_visibility.sql):
//   1. Reconcilia: oculta los videos que exceden el cupo del plan vigente y
//      reexpone los que vuelven a caber (p. ej. tras re-suscribirse). Es lo que
//      hace efectiva la caída de plan sin que el usuario toque nada.
//   2. Avisa a quien tenga videos por vencer (15 días y 1 día antes).
//   3. Purga los que llevan PLAN_HIDDEN_RETENTION_DAYS ocultos, borrando también
//      el asset en Cloudinary/Storage (por eso vive acá y no en SQL: el destroy
//      de Cloudinary necesita el API secret, que solo existe en el servidor).

export const runtime = 'nodejs'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const WARN_DAYS = [15, 1]

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
    logger.error('plan-content', 'CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const errors: string[] = []

  // ── 1. Reconciliar cupos según el plan vigente ────────────────────────────
  let reconciled = 0
  const { data: reconcileData, error: reconcileErr } = await (admin as any).rpc('reconcile_all_post_owners')
  if (reconcileErr) {
    errors.push(`reconcile: ${reconcileErr.message}`)
    logger.error('plan-content:reconcile_failed', reconcileErr.message)
  } else {
    reconciled = Number(reconcileData ?? 0)
  }

  // ── 2. Avisos previos a la purga ──────────────────────────────────────────
  // Un aviso por usuario y por hito, agregando todos sus videos por vencer.
  let warned = 0
  for (const daysLeft of WARN_DAYS) {
    // Ventana de 24 h: los ocultados hace exactamente (retención - daysLeft) días.
    const ageDays = PLAN_HIDDEN_RETENTION_DAYS - daysLeft
    const windowEnd = new Date(Date.now() - ageDays * DAY_MS)
    const windowStart = new Date(windowEnd.getTime() - DAY_MS)

    const { data: expiring, error: expErr } = await (admin as any)
      .from('posts')
      .select('id, user_id, plan_hidden_at')
      .not('plan_hidden_at', 'is', null)
      .gte('plan_hidden_at', windowStart.toISOString())
      .lt('plan_hidden_at', windowEnd.toISOString())

    if (expErr) {
      errors.push(`warn_query(${daysLeft}d): ${expErr.message}`)
      continue
    }

    const byUser = new Map<string, number>()
    for (const p of (expiring as any[]) ?? []) {
      byUser.set(p.user_id, (byUser.get(p.user_id) ?? 0) + 1)
    }
    if (byUser.size === 0) continue

    // Dedup: si ya se avisó a este usuario en las últimas 20 h, no repetir
    // (protege ante reintentos del cron o dobles ejecuciones).
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await (admin as any)
      .from('notifications')
      .select('user_id')
      .eq('type', 'posts_expiring')
      .in('user_id', Array.from(byUser.keys()))
      .gte('created_at', since)
    const alreadyWarned = new Set(((recent as any[]) ?? []).map((n) => n.user_id))

    const rows = Array.from(byUser.entries())
      .filter(([userId]) => !alreadyWarned.has(userId))
      .map(([userId, count]) => ({
        user_id: userId,
        type: 'posts_expiring',
        data: { count, days_left: daysLeft },
      }))

    if (rows.length === 0) continue

    const { error: notifErr } = await (admin as any).from('notifications').insert(rows)
    if (notifErr) {
      errors.push(`warn_insert(${daysLeft}d): ${notifErr.message}`)
    } else {
      warned += rows.length
      await sendPushToUsers(rows.map((r) => r.user_id), {
        title: 'Tus videos guardados están por vencer',
        body: daysLeft === 1
          ? 'Mañana se eliminan tus videos guardados en privado. Activa un plan para conservarlos.'
          : `En ${daysLeft} días se eliminan tus videos guardados en privado.`,
        data: { type: 'posts_expiring', days_left: daysLeft },
      }).catch(() => {})
    }
  }

  // ── 3. Purga de los vencidos ──────────────────────────────────────────────
  const purgeCutoff = new Date(Date.now() - PLAN_HIDDEN_RETENTION_DAYS * DAY_MS).toISOString()

  const { data: expired, error: expiredErr } = await (admin as any)
    .from('posts')
    .select('id, user_id, video_url, thumbnail_url')
    .not('plan_hidden_at', 'is', null)
    .lt('plan_hidden_at', purgeCutoff)
    .limit(200)

  if (expiredErr) errors.push(`purge_query: ${expiredErr.message}`)

  let purged = 0
  for (const post of (expired as any[]) ?? []) {
    try {
      await deleteCloudinaryAssets([post.video_url, post.thumbnail_url])

      // Fallback a Storage cuando Cloudinary no está configurado: el video vive
      // en el bucket posts-media con path `{userId}/{timestamp}.{ext}`.
      const storagePaths = [post.video_url, post.thumbnail_url]
        .filter((u: unknown): u is string => typeof u === 'string' && u.includes('/posts-media/'))
        .map((u: string) => u.split('/posts-media/')[1]?.split('?')[0] ?? '')
        .filter(Boolean)
      if (storagePaths.length > 0) {
        const { error: storageErr } = await admin.storage.from('posts-media').remove(storagePaths)
        if (storageErr) logger.warn('plan-content:storage_delete_failed', { postId: post.id, reason: storageErr.message })
      }

      const { error: delErr } = await (admin as any).from('posts').delete().eq('id', post.id)
      if (delErr) {
        errors.push(`purge(${post.id}): ${delErr.message}`)
      } else {
        purged++
        logger.info('plan-content:post_purged', { post_id: post.id, user_id: post.user_id })
      }
    } catch (e) {
      errors.push(`purge(${post.id}): ${(e as Error).message}`)
    }
  }

  logger.info('plan-content:done', { reconciled, warned, purged, errors: errors.length })
  await pingHealthcheck(process.env.HEALTHCHECK_PLAN_CONTENT_UUID)

  return NextResponse.json({ reconciled, warned, purged, errors })
}
