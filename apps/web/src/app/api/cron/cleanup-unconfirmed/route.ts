import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron runs this daily at 04:00 UTC.
// Deletes auth users whose email is still unconfirmed after 1 day.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

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
      if (delErr) errors.push(`${u.id}: ${delErr.message}`)
      else deleted++
    }

    if (data.users.length < 1000) break
    page++
  }

  console.log(`[cleanup-unconfirmed] deleted=${deleted} errors=${errors.length}`)
  return NextResponse.json({ deleted, errors })
}
