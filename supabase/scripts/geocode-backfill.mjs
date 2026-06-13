#!/usr/bin/env node
// ============================================================
// geocode-backfill.mjs — One-off / on-demand maintenance script
//
// Drives the protected /api/admin/geocode-backfill route in a loop until no
// rows remain. The route does the actual geocoding (server-side, compliant
// User-Agent, 1 req/s throttle) so the logic lives in one place.
//
// This is the SAFEST migration path: idempotent, rate-limited, never deletes
// data, never overwrites existing coordinates, re-runnable.
//
// Usage:
//   ADMIN_BASE=https://danzclass.com \
//   ADMIN_COOKIE='sb-access-token=...; sb-refresh-token=...' \
//   node supabase/scripts/geocode-backfill.mjs [classes|events] [--dry-run]
//
// Get ADMIN_COOKIE by logging in as the superadmin and copying the Supabase
// auth cookies from your browser devtools (Application → Cookies).
// ============================================================

const BASE = process.env.ADMIN_BASE
const COOKIE = process.env.ADMIN_COOKIE
const table = process.argv[2] === 'events' ? 'events' : 'classes'
const dryRun = process.argv.includes('--dry-run')

if (!BASE || !COOKIE) {
  console.error('ERROR: set ADMIN_BASE and ADMIN_COOKIE env vars')
  process.exit(1)
}

let totalGeocoded = 0
let totalFailed = 0
let round = 0

while (true) {
  round++
  const res = await fetch(`${BASE}/api/admin/geocode-backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ table, limit: 25, dryRun }),
  })

  if (!res.ok) {
    console.error(`Round ${round}: HTTP ${res.status} — ${await res.text()}`)
    process.exit(1)
  }

  const r = await res.json()
  totalGeocoded += r.geocoded
  totalFailed += r.failed
  console.log(
    `Round ${round} [${table}]: scanned=${r.scanned} geocoded=${r.geocoded} failed=${r.failed} skipped=${r.skipped}`
  )

  if (!r.hasMore) break
}

console.log(`\nDone. ${dryRun ? '(dry run) ' : ''}geocoded=${totalGeocoded} failed=${totalFailed}`)
