/**
 * Unit tests for apps/web/src/lib/utils.ts — pure helper functions.
 *
 * Covers:
 *   - formatTime: 24h → 12h AM/PM conversion, edge cases (00:00, 12:00, 23:59)
 *   - formatDate: YYYY-MM-DD parsed as local midnight (no UTC off-by-one)
 *   - getClassSessions: suelta, weekly, biweekly, monthly, custom recurrences
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import { formatTime, formatDate, getClassSessions } from '../../apps/web/src/lib/utils'

// ─── formatTime ──────────────────────────────────────────────────────────────

test.describe('formatTime', () => {
  test('08:00 → 8:00 AM', () => expect(formatTime('08:00')).toBe('8:00 AM'))
  test('00:00 → 12:00 AM (midnight)', () => expect(formatTime('00:00')).toBe('12:00 AM'))
  test('12:00 → 12:00 PM (noon)', () => expect(formatTime('12:00')).toBe('12:00 PM'))
  test('13:30 → 1:30 PM', () => expect(formatTime('13:30')).toBe('1:30 PM'))
  test('23:59 → 11:59 PM', () => expect(formatTime('23:59')).toBe('11:59 PM'))
  test('09:05 → 9:05 AM (preserves leading zero in minutes)', () =>
    expect(formatTime('09:05')).toBe('9:05 AM'))
  test('11:59 → 11:59 AM', () => expect(formatTime('11:59')).toBe('11:59 AM'))
  test('12:01 → 12:01 PM', () => expect(formatTime('12:01')).toBe('12:01 PM'))
})

// ─── formatDate ──────────────────────────────────────────────────────────────

test.describe('formatDate — YYYY-MM-DD no off-by-one', () => {
  test('2026-01-15 → contains "15", "enero", "2026"', () => {
    const result = formatDate('2026-01-15')
    expect(result).toContain('15')
    expect(result).toContain('enero')
    expect(result).toContain('2026')
  })

  test('2026-01-01 must not show Dec 31 (UTC off-by-one guard)', () => {
    const result = formatDate('2026-01-01')
    expect(result).toContain('1')
    expect(result).toContain('enero')
    expect(result).not.toContain('diciembre')
  })

  test('2026-03-01 must show March 1, not Feb 28', () => {
    const result = formatDate('2026-03-01')
    expect(result).toContain('marzo')
    expect(result).not.toContain('febrero')
  })

  test('2026-12-31 → contains "31", "diciembre", "2026"', () => {
    const result = formatDate('2026-12-31')
    expect(result).toContain('31')
    expect(result).toContain('diciembre')
    expect(result).toContain('2026')
  })

  test('ISO timestamp string → formats without crash', () => {
    const result = formatDate('2026-05-15T12:00:00.000Z')
    expect(result).toBeTruthy()
    expect(result).toContain('2026')
  })
})

// ─── getClassSessions ────────────────────────────────────────────────────────

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

test.describe('getClassSessions — suelta', () => {
  test('date inside window → returns [date]', () => {
    const cls = { type: 'suelta', date: '2027-06-07' }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual(['2027-06-07'])
  })

  test('date before window → returns []', () => {
    const cls = { type: 'suelta', date: '2027-05-20' }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual([])
  })

  test('date after window → returns []', () => {
    const cls = { type: 'suelta', date: '2027-07-01' }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual([])
  })

  test('date exactly on fromDate boundary → included', () => {
    const cls = { type: 'suelta', date: '2027-06-01' }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual(['2027-06-01'])
  })

  test('date exactly on toDate boundary → included', () => {
    const cls = { type: 'suelta', date: '2027-06-30' }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual(['2027-06-30'])
  })

  test('no date field → returns []', () => {
    const cls = { type: 'suelta' }
    expect(getClassSessions(cls, parseLocal('2027-06-01'), parseLocal('2027-06-30'))).toEqual([])
  })
})

test.describe('getClassSessions — custom recurrence', () => {
  test('two dates in window, one outside → returns the two', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'custom',
      custom_dates: ['2027-06-07', '2027-06-14', '2027-07-01'],
    }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    const result = getClassSessions(cls, from, to)
    expect(result).toEqual(['2027-06-07', '2027-06-14'])
  })

  test('empty custom_dates → returns []', () => {
    const cls = { type: 'periodica', recurrence: 'custom', custom_dates: [] }
    expect(getClassSessions(cls, parseLocal('2027-06-01'), parseLocal('2027-06-30'))).toEqual([])
  })

  test('all dates outside window → returns []', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'custom',
      custom_dates: ['2027-05-01', '2027-07-01'],
    }
    expect(getClassSessions(cls, parseLocal('2027-06-01'), parseLocal('2027-06-30'))).toEqual([])
  })
})

test.describe('getClassSessions — weekly recurrence', () => {
  // 2027-06-07 is Monday. A weekly class starting that Monday, querying June 2027.
  test('weekly class (Monday) over 4 Mondays in June 2027', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'weekly',
      day_of_week: 1, // Monday in JS
      start_date: '2027-06-07',
      ends_indefinitely: true,
    }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    const result = getClassSessions(cls, from, to)
    // Mondays in June 2027: 7, 14, 21, 28
    expect(result).toEqual(['2027-06-07', '2027-06-14', '2027-06-21', '2027-06-28'])
  })

  test('weekly class with ends_at before window end → stops early', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'weekly',
      day_of_week: 1,
      start_date: '2027-06-07',
      ends_at: '2027-06-14', // stops after June 14
      ends_indefinitely: false,
    }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    const result = getClassSessions(cls, from, to)
    expect(result).toEqual(['2027-06-07', '2027-06-14'])
  })

  test('window before class start → returns []', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'weekly',
      day_of_week: 1,
      start_date: '2027-07-07',
      ends_indefinitely: true,
    }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    expect(getClassSessions(cls, from, to)).toEqual([])
  })
})

test.describe('getClassSessions — biweekly recurrence', () => {
  // 2027-06-07 is Monday, biweekly from there: June 7, 21 (skips 14, 28)
  test('biweekly class over June 2027 returns alternating weeks', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'biweekly',
      day_of_week: 1,
      start_date: '2027-06-07',
      ends_indefinitely: true,
    }
    const from = parseLocal('2027-06-01')
    const to = parseLocal('2027-06-30')
    const result = getClassSessions(cls, from, to)
    expect(result).toEqual(['2027-06-07', '2027-06-21'])
  })
})

test.describe('getClassSessions — monthly recurrence', () => {
  // Monthly class on day 15, starting 2027-01-15
  test('monthly class on 15th: returns the 15th of each month in window', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'monthly',
      start_date: '2027-01-15',
      ends_indefinitely: true,
    }
    const from = parseLocal('2027-03-01')
    const to = parseLocal('2027-05-31')
    const result = getClassSessions(cls, from, to)
    expect(result).toContain('2027-03-15')
    expect(result).toContain('2027-04-15')
    expect(result).toContain('2027-05-15')
    expect(result).length === 3
  })

  test('monthly class on day 31 — February clamps to last day', () => {
    const cls = {
      type: 'periodica',
      recurrence: 'monthly',
      start_date: '2027-01-31',
      ends_indefinitely: true,
    }
    const from = parseLocal('2027-02-01')
    const to = parseLocal('2027-02-28')
    const result = getClassSessions(cls, from, to)
    // Feb 2027 has 28 days → clamped to 28
    expect(result).toEqual(['2027-02-28'])
  })
})
