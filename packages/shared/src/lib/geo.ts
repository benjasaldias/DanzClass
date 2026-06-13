// Geolocation helpers shared by web + mobile.
// Distance math (Haversine) for client-side display, distance formatting,
// and the lightweight types used across the geocoding flow.

export interface LatLng {
  lat: number
  lng: number
}

/** A geocoding suggestion returned by our /api/geocode/search proxy. */
export interface GeocodeResult {
  /** Human-readable label shown in the autocomplete dropdown. */
  label: string
  /** The address string we persist as location_address. */
  address: string
  lat: number
  lng: number
}

/** Chile's rough centroid — a sensible default map center when we have no fix. */
export const CHILE_CENTER: LatLng = { lat: -33.45, lng: -70.6667 } // Santiago

const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Great-circle distance between two points in meters (Haversine).
 * Accurate to well within the precision we care about for "nearby" sorting.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Compact, human-friendly distance string.
 *   120   -> "120 m"
 *   450   -> "450 m"
 *   1234  -> "1.2 km"
 *   8730  -> "8.7 km"
 *   >= 100 km -> "120 km" (no decimal, it's far anyway)
 * Sub-kilometer values round to the nearest 10 m to avoid false precision.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) {
    const rounded = Math.round(meters / 10) * 10
    return `${rounded} m`
  }
  const km = meters / 1000
  if (km >= 100) return `${Math.round(km)} km`
  return `${km.toFixed(1)} km`
}

/** Coordinates are valid only inside Chile's bounding box (incl. far south + Easter Island). */
export function isValidChileCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  // Continental + insular Chile. Easter Island sits at ~-27.1, -109.4.
  return lat >= -56.5 && lat <= -17.0 && lng >= -110.0 && lng <= -66.0
}

/** True when a row carries usable coordinates. */
export function hasCoords(row: { latitude?: number | null; longitude?: number | null } | null | undefined): boolean {
  return (
    !!row &&
    typeof row.latitude === 'number' &&
    typeof row.longitude === 'number' &&
    isValidChileCoord(row.latitude, row.longitude)
  )
}
