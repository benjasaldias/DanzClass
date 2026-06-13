import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import { geocodeAddress } from '@/lib/geocode'
import { logger } from '@/lib/logger'

// Address autocomplete + geocoding proxy. Auth required (creators only),
// Chile-only, rate-limited. Works for web (cookie) and mobile (Bearer).
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if ('error' in auth) return auth.error

  const limited = await checkRateLimit(`geocode:${auth.user.id}`, 'geocode')
  if (limited) return limited

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 3) {
    return NextResponse.json({ results: [] })
  }

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') || '5', 10)
  const limit = Number.isFinite(limitParam) ? limitParam : 5

  try {
    const results = await geocodeAddress(q, limit)
    return NextResponse.json({ results })
  } catch (err) {
    logger.error('geocode_search_failed', err, { q })
    return NextResponse.json(
      { error: 'No se pudo buscar la dirección. Intenta de nuevo.', results: [] },
      { status: 502 }
    )
  }
}
