/**
 * Unit tests for packages/shared/src/types/index.ts — pure helper functions.
 *
 * Covers:
 *   - canTeach, canTeachUnlimited, canEnroll, canUploadVideo, canPostVideo, canUploadMedia
 *   - pluralize
 *   - formatDateLocal (YYYY-MM-DD → locale string, no off-by-one)
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import {
  canTeach,
  canTeachUnlimited,
  canEnroll,
  canUploadVideo,
  canPostVideo,
  canUploadMedia,
  pluralize,
  formatDateLocal,
} from '../../packages/shared/src/types/index'

import type { SubscriptionTier } from '../../packages/shared/src/types/index'

const ALL_TIERS: SubscriptionTier[] = ['none', 'basic', 'teacher', 'pro']

// ─── canTeach ────────────────────────────────────────────────────────────────

test.describe('canTeach', () => {
  test('none → false', () => expect(canTeach('none')).toBe(false))
  test('basic → true', () => expect(canTeach('basic')).toBe(true))
  test('teacher → true', () => expect(canTeach('teacher')).toBe(true))
  test('pro → true', () => expect(canTeach('pro')).toBe(true))
})

// ─── canTeachUnlimited ───────────────────────────────────────────────────────

test.describe('canTeachUnlimited', () => {
  test('none → false', () => expect(canTeachUnlimited('none')).toBe(false))
  test('basic → false', () => expect(canTeachUnlimited('basic')).toBe(false))
  test('teacher → true', () => expect(canTeachUnlimited('teacher')).toBe(true))
  test('pro → true', () => expect(canTeachUnlimited('pro')).toBe(true))
})

// ─── canEnroll ───────────────────────────────────────────────────────────────

test.describe('canEnroll', () => {
  test('none → false', () => expect(canEnroll('none')).toBe(false))
  test('basic → true', () => expect(canEnroll('basic')).toBe(true))
  test('teacher → true', () => expect(canEnroll('teacher')).toBe(true))
  test('pro → true', () => expect(canEnroll('pro')).toBe(true))
})

// ─── canUploadVideo ──────────────────────────────────────────────────────────

test.describe('canUploadVideo', () => {
  test('none → false', () => expect(canUploadVideo('none')).toBe(false))
  test('basic → false', () => expect(canUploadVideo('basic')).toBe(false))
  test('teacher → true', () => expect(canUploadVideo('teacher')).toBe(true))
  test('pro → true', () => expect(canUploadVideo('pro')).toBe(true))
})

// ─── canPostVideo ────────────────────────────────────────────────────────────

test.describe('canPostVideo', () => {
  test('none → false', () => expect(canPostVideo('none')).toBe(false))
  test('basic → true', () => expect(canPostVideo('basic')).toBe(true))
  test('teacher → true', () => expect(canPostVideo('teacher')).toBe(true))
  test('pro → true', () => expect(canPostVideo('pro')).toBe(true))
})

// ─── canUploadMedia ──────────────────────────────────────────────────────────

test.describe('canUploadMedia', () => {
  test('none → false', () => expect(canUploadMedia('none')).toBe(false))
  test('basic → true', () => expect(canUploadMedia('basic')).toBe(true))
  test('teacher → true', () => expect(canUploadMedia('teacher')).toBe(true))
  test('pro → true', () => expect(canUploadMedia('pro')).toBe(true))
})

// ─── pluralize ────────────────────────────────────────────────────────────────

test.describe('pluralize', () => {
  test('n=1 → singular', () => expect(pluralize(1, 'cupo', 'cupos')).toBe('1 cupo'))
  test('n=0 → plural', () => expect(pluralize(0, 'cupo', 'cupos')).toBe('0 cupos'))
  test('n=2 → plural', () => expect(pluralize(2, 'cupo', 'cupos')).toBe('2 cupos'))
  test('n=10 → plural', () => expect(pluralize(10, 'alumno', 'alumnos')).toBe('10 alumnos'))
  test('n=1 with another word → singular', () =>
    expect(pluralize(1, 'clase', 'clases')).toBe('1 clase'))
})

// ─── formatDateLocal ─────────────────────────────────────────────────────────

test.describe('formatDateLocal — no off-by-one in local timezone', () => {
  test('2026-01-15 → contains "15", "enero", "2026"', () => {
    const result = formatDateLocal('2026-01-15')
    expect(result).toContain('15')
    expect(result).toContain('enero')
    expect(result).toContain('2026')
  })

  test('2026-12-31 → contains "31", "diciembre", "2026"', () => {
    const result = formatDateLocal('2026-12-31')
    expect(result).toContain('31')
    expect(result).toContain('diciembre')
    expect(result).toContain('2026')
  })

  test('2026-01-01 — first day of year, must not show Dec 31 (UTC off-by-one guard)', () => {
    const result = formatDateLocal('2026-01-01')
    // Must say "1" and "enero", NOT "diciembre" or "31"
    expect(result).toContain('1')
    expect(result).toContain('enero')
    expect(result).not.toContain('diciembre')
  })

  test('2026-03-01 — must show March 1, not Feb 28', () => {
    const result = formatDateLocal('2026-03-01')
    expect(result).toContain('marzo')
    expect(result).not.toContain('febrero')
  })

  test('2026-07-04 → contains "4", "julio", "2026"', () => {
    const result = formatDateLocal('2026-07-04')
    expect(result).toContain('4')
    expect(result).toContain('julio')
    expect(result).toContain('2026')
  })
})
