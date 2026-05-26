import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron runs this daily at 04:00 UTC.
// Deletes auth users whose email is still unconfirmed after 36 horas.
// Margen extra (vs. 24 h) para evitar borrar a usuarios que confirman justo
// en la ventana de ejecución del cron.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error('[cleanup-unconfirmed] CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000)

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
        console.log(`[cleanup-unconfirmed] deleted user=${u.id} email=${u.email} created_at=${u.created_at}`)
      }
    }

    if (data.users.length < 1000) break
    page++
  }

  console.log(`[cleanup-unconfirmed] deleted=${deleted} errors=${errors.length}`)
  return NextResponse.json({ deleted, errors })
}
