import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// Vercel Cron runs this daily at 04:00 UTC.
// Deletes auth users whose email is still unconfirmed after 7 días (item 4:
// la cuenta se borra a los 7 días si el correo no fue confirmado). Antes eran
// 36 h; se amplió porque ahora la confirmación es obligatoria para hacer login,
// así que conviene darle al usuario una ventana amplia para confirmar.

export const runtime = 'nodejs'

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
    logger.error('cleanup-unconfirmed', 'CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  let page = 1
  let deleted = 0
  const errors: string[] = []

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) break

    const stale = data.users.filter(
      (u) => !u.email_confirmed_at && new Date(u.created_at) < cutoff
    )

    for (const u of stale) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
      if (delErr) {
        errors.push(`${u.id}: ${delErr.message}`)
      } else {
        deleted++
        logger.info('cleanup-unconfirmed:deleted', { user_id: u.id })
      }
    }

    if (data.users.length < 1000) break
    page++
  }

  logger.info('cleanup-unconfirmed:done', { deleted, errors: errors.length })

  await pingHealthcheck(process.env.HEALTHCHECK_CLEANUP_UNCONFIRMED_UUID)

  return NextResponse.json({ deleted, errors })
}
