// Server-side geocoding via OpenStreetMap Nominatim.
//
// We ALWAYS call Nominatim from the server (never the browser/app) so we can:
//   1. send a compliant User-Agent / contact email (required by the usage policy),
//   2. restrict results to Chile (countrycodes=cl),
//   3. cache responses to stay under the 1 req/s public limit.
//
// Swap NOMINATIM_BASE for a self-hosted instance (or Photon) to remove the
// public rate limit — see recommendations.md.

import type { GeocodeResult } from '@danceclass/shared'
import { isValidChileCoord } from '@danceclass/shared'

const NOMINATIM_BASE = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org'
// Nominatim asks for a real contact in the User-Agent / email param.
const CONTACT_EMAIL = process.env.GEOCODE_CONTACT_EMAIL || 'contacto@danzclass.com'
const USER_AGENT = `DanzClass/1.0 (${CONTACT_EMAIL})`

// Tiny in-memory cache (per serverless instance). Cheap protection against
// repeated identical lookups from autocomplete keystrokes / backfill retries.
type CacheEntry = { at: number; results: GeocodeResult[] }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24h
const CACHE_MAX = 500

function cacheGet(key: string): GeocodeResult[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.results
}

function cacheSet(key: string, results: GeocodeResult[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), results })
}

function buildLabel(addr: Record<string, string> | undefined, fallback: string): { label: string; address: string } {
  if (!addr) return { label: fallback, address: fallback }
  const road = addr.road || addr.pedestrian || addr.neighbourhood || ''
  const num = addr.house_number ? ` ${addr.house_number}` : ''
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || ''
  const parts = [road ? `${road}${num}` : '', city].filter(Boolean)
  const label = parts.join(', ') || fallback
  return { label, address: label }
}

/**
 * Geocode free-text into up to `limit` Chilean addresses with coordinates.
 * Returns [] when nothing usable is found. Throws only on network failure.
 */
export async function geocodeAddress(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const cacheKey = `${q.toLowerCase()}::${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const url = new URL(`${NOMINATIM_BASE}/search`)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'cl') // Chile only
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 10)))
  url.searchParams.set('accept-language', 'es')
  url.searchParams.set('email', CONTACT_EMAIL)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    // Nominatim can be slow; bail rather than hang the request.
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    throw new Error(`nominatim_${res.status}`)
  }

  const raw = (await res.json()) as Array<{
    lat: string
    lon: string
    display_name: string
    address?: Record<string, string>
  }>

  const results: GeocodeResult[] = raw
    .map((r) => {
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lon)
      const { label, address } = buildLabel(r.address, r.display_name)
      return { label, address, lat, lng }
    })
    .filter((r) => isValidChileCoord(r.lat, r.lng))

  cacheSet(cacheKey, results)
  return results
}
