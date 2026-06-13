import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodeAddress } from '@/lib/geocode'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Build the best text query we have for a row.
function queryFor(row: { location_address?: string | null; location_name?: string | null; city?: string | null }): string | null {
  const parts = [row.location_address, row.location_name, row.city]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  // Ensure Chile bias even if the address omits it.
  const base = parts.join(', ')
  return /chile/i.test(base) ? base : `${base}, Chile`
}

/**
 * Idempotent, rate-limited backfill of coordinates for existing rows that have
 * a textual address but no latitude/longitude. Superadmin only.
 *
 * Body: { table?: 'classes' | 'events', limit?: number, dryRun?: boolean }
 * Safe to call repeatedly — it only touches rows where latitude IS NULL, never
 * overwrites existing coordinates, and never deletes data.
 */
export async function POST(req: NextRequest) {
  if (!process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 503 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const table: 'classes' | 'events' = body.table === 'events' ? 'events' : 'classes'
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 25, 1), 50)
  const dryRun = body.dryRun === true

  const admin = createAdminClient()

  // Rows missing coordinates but with some address text.
  const { data: rows, error } = await (admin as any)
    .from(table)
    .select('id, location_name, location_address, city')
    .is('latitude', null)
    .limit(limit)

  if (error) {
    logger.error('geocode_backfill_query_failed', error, { table })
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  let geocoded = 0
  let skipped = 0
  let failed = 0
  const details: Array<{ id: string; status: string; address?: string }> = []

  for (const row of (rows ?? []) as any[]) {
    const q = queryFor(row)
    if (!q) {
      skipped++
      details.push({ id: row.id, status: 'no_address' })
      continue
    }
    try {
      const [best] = await geocodeAddress(q, 1)
      if (!best) {
        failed++
        details.push({ id: row.id, status: 'not_found', address: q })
      } else {
        if (!dryRun) {
          await (admin as any)
            .from(table)
            .update({ latitude: best.lat, longitude: best.lng })
            .eq('id', row.id)
        }
        geocoded++
        details.push({ id: row.id, status: dryRun ? 'would_geocode' : 'geocoded', address: best.address })
      }
    } catch (err) {
      failed++
      details.push({ id: row.id, status: 'error', address: q })
      logger.error('geocode_backfill_row_failed', err, { table, id: row.id })
    }
    // Respect Nominatim's ~1 req/s public limit.
    await sleep(1100)
  }

  logger.info('geocode_backfill', { table, scanned: rows?.length ?? 0, geocoded, skipped, failed, dryRun })
  return NextResponse.json({
    table,
    scanned: rows?.length ?? 0,
    geocoded,
    skipped,
    failed,
    dryRun,
    // True while there may be more rows to process (call again).
    hasMore: (rows?.length ?? 0) === limit,
    details,
  })
}
