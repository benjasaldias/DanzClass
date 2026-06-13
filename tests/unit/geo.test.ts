/**
 * Unit tests for packages/shared/src/lib/geo.ts — distance math + formatting.
 *
 * Covers:
 *   - haversineMeters (known city-to-city distances)
 *   - formatDistance (compact "120 m" / "1.2 km" formatting)
 *   - isValidChileCoord (bounding-box validation)
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import {
  haversineMeters,
  formatDistance,
  isValidChileCoord,
} from '../../packages/shared/src/lib/geo'

test.describe('haversineMeters', () => {
  test('returns 0 for identical points', () => {
    const p = { lat: -33.45, lng: -70.6667 }
    expect(haversineMeters(p, p)).toBe(0)
  })

  test('matches a known distance (Santiago centro → Providencia ~4 km)', () => {
    const centro = { lat: -33.4489, lng: -70.6693 }
    const providencia = { lat: -33.4314, lng: -70.6093 }
    const d = haversineMeters(centro, providencia)
    // ~5.8 km — allow generous tolerance for rounding/coordinates
    expect(d).toBeGreaterThan(5000)
    expect(d).toBeLessThan(7000)
  })

  test('is symmetric', () => {
    const a = { lat: -33.45, lng: -70.66 }
    const b = { lat: -36.82, lng: -73.05 } // Concepción
    expect(Math.abs(haversineMeters(a, b) - haversineMeters(b, a))).toBeLessThan(1)
  })
})

test.describe('formatDistance', () => {
  test('sub-kilometer rounds to nearest 10 m', () => {
    expect(formatDistance(120)).toBe('120 m')
    expect(formatDistance(124)).toBe('120 m')
    expect(formatDistance(449)).toBe('450 m')
  })

  test('kilometer values use one decimal', () => {
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(8730)).toBe('8.7 km')
  })

  test('large distances drop the decimal', () => {
    expect(formatDistance(120000)).toBe('120 km')
  })

  test('invalid input returns empty string', () => {
    expect(formatDistance(-5)).toBe('')
    expect(formatDistance(NaN)).toBe('')
  })
})

test.describe('isValidChileCoord', () => {
  test('accepts Santiago', () => {
    expect(isValidChileCoord(-33.45, -70.6667)).toBe(true)
  })

  test('accepts Easter Island', () => {
    expect(isValidChileCoord(-27.11, -109.35)).toBe(true)
  })

  test('rejects out-of-country coords', () => {
    expect(isValidChileCoord(40.7128, -74.006)).toBe(false) // New York
    expect(isValidChileCoord(0, 0)).toBe(false)
  })

  test('rejects non-finite values', () => {
    expect(isValidChileCoord(NaN, -70)).toBe(false)
    expect(isValidChileCoord(-33, Infinity)).toBe(false)
  })
})
