/**
 * Unit tests for packages/shared/src/lib/availability.ts
 *
 * These run without any browser. No server needs to be running.
 * Run with: npm run test:unit
 *
 * Coverage:
 *   - isSleepHour: normal range, midnight-crossing, no-config sentinel
 *   - isBlockOccupied: busy block, free slot, sleep override
 *   - getSleepHours: normal, midnight-crossing, empty
 *   - dateToWeekday: Mon→0, Sun→6, boundary days
 *   - classConflictsWithSchedule: suelta, periodic, custom, past dates, midnight-crossing sleep
 */

import { test, expect } from '@playwright/test'
import {
  isSleepHour,
  isBlockOccupied,
  getSleepHours,
  dateToWeekday,
  classConflictsWithSchedule,
} from '../../packages/shared/src/lib/availability'

import type { BusyBlock } from '../../packages/shared/src/lib/availability'

// ─── isSleepHour ─────────────────────────────────────────────────────────────

test.describe('isSleepHour', () => {
  test('sleepStart === sleepEnd → always false (no sleep configured)', () => {
    expect(isSleepHour(0, 0, 0)).toBe(false)
    expect(isSleepHour(8, 8, 8)).toBe(false)
    expect(isSleepHour(12, 12, 12)).toBe(false)
  })

  test('normal range (no midnight crossing): hour inside window', () => {
    // Sleeps from 00:00 to 08:00 (default)
    expect(isSleepHour(0, 0, 8)).toBe(true)
    expect(isSleepHour(3, 0, 8)).toBe(true)
    expect(isSleepHour(7, 0, 8)).toBe(true)
  })

  test('normal range: boundary — hour equals sleepEnd is NOT inside (half-open interval)', () => {
    expect(isSleepHour(8, 0, 8)).toBe(false)
  })

  test('normal range: hour outside window', () => {
    expect(isSleepHour(9, 0, 8)).toBe(false)
    expect(isSleepHour(23, 0, 8)).toBe(false)
  })

  test('midnight-crossing range (sleepStart > sleepEnd): hour inside window', () => {
    // Sleeps from 23:00 to 07:00
    expect(isSleepHour(23, 23, 7)).toBe(true)
    expect(isSleepHour(0, 23, 7)).toBe(true)
    expect(isSleepHour(6, 23, 7)).toBe(true)
  })

  test('midnight-crossing range: boundary — sleepEnd is NOT inside', () => {
    expect(isSleepHour(7, 23, 7)).toBe(false)
  })

  test('midnight-crossing range: hours outside window', () => {
    expect(isSleepHour(8, 23, 7)).toBe(false)
    expect(isSleepHour(12, 23, 7)).toBe(false)
    expect(isSleepHour(22, 23, 7)).toBe(false)
  })
})

// ─── isBlockOccupied ─────────────────────────────────────────────────────────

test.describe('isBlockOccupied', () => {
  const blocks: BusyBlock[] = [
    { weekday: 0, hour: 14 }, // Monday 14:00
    { weekday: 3, hour: 10 }, // Thursday 10:00
  ]

  test('returns true for a manually marked busy block', () => {
    expect(isBlockOccupied(0, 14, blocks, 0, 8)).toBe(true)
    expect(isBlockOccupied(3, 10, blocks, 0, 8)).toBe(true)
  })

  test('returns false for a free (unmarked, awake) slot', () => {
    expect(isBlockOccupied(0, 15, blocks, 0, 8)).toBe(false)
    expect(isBlockOccupied(1, 14, blocks, 0, 8)).toBe(false) // different weekday
  })

  test('sleep hour overrides even with no busy blocks', () => {
    expect(isBlockOccupied(0, 3, [], 0, 8)).toBe(true)
    expect(isBlockOccupied(6, 7, [], 0, 8)).toBe(true)
  })

  test('busy block during sleep window still returns true (redundant but consistent)', () => {
    const sleepBlock: BusyBlock[] = [{ weekday: 0, hour: 2 }]
    expect(isBlockOccupied(0, 2, sleepBlock, 0, 8)).toBe(true)
  })

  test('returns false with empty blocks and awake hour', () => {
    expect(isBlockOccupied(0, 10, [], 0, 8)).toBe(false)
    expect(isBlockOccupied(5, 20, [], 0, 8)).toBe(false)
  })
})

// ─── getSleepHours ───────────────────────────────────────────────────────────

test.describe('getSleepHours', () => {
  test('default sleep 0–8 returns [0, 1, 2, 3, 4, 5, 6, 7]', () => {
    expect(getSleepHours(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test('sleepStart === sleepEnd → empty array', () => {
    expect(getSleepHours(0, 0)).toEqual([])
    expect(getSleepHours(8, 8)).toEqual([])
  })

  test('midnight-crossing: contains hours from start to 23 and 0 to end-1', () => {
    const hours = getSleepHours(22, 6)
    expect(hours).toContain(22)
    expect(hours).toContain(23)
    expect(hours).toContain(0)
    expect(hours).toContain(5)
    expect(hours).not.toContain(6)
    expect(hours).not.toContain(12)
    expect(hours.length).toBe(8) // 22, 23, 0, 1, 2, 3, 4, 5
  })

  test('full-night crossing (23:00–07:00) returns 8 hours', () => {
    const hours = getSleepHours(23, 7)
    expect(hours.length).toBe(8) // 23, 0, 1, 2, 3, 4, 5, 6
    expect(hours).toContain(23)
    expect(hours).toContain(0)
    expect(hours).not.toContain(7)
  })
})

// ─── dateToWeekday ───────────────────────────────────────────────────────────

test.describe('dateToWeekday', () => {
  // Reference week: 2026-05-25 (Mon) … 2026-05-31 (Sun)

  test('Monday → 0', () => {
    expect(dateToWeekday(new Date(2026, 4, 25))).toBe(0)
  })

  test('Tuesday → 1', () => {
    expect(dateToWeekday(new Date(2026, 4, 26))).toBe(1)
  })

  test('Wednesday → 2', () => {
    expect(dateToWeekday(new Date(2026, 4, 27))).toBe(2)
  })

  test('Thursday → 3', () => {
    expect(dateToWeekday(new Date(2026, 4, 28))).toBe(3)
  })

  test('Friday → 4', () => {
    expect(dateToWeekday(new Date(2026, 4, 29))).toBe(4)
  })

  test('Saturday → 5', () => {
    expect(dateToWeekday(new Date(2026, 4, 30))).toBe(5)
  })

  test('Sunday → 6', () => {
    expect(dateToWeekday(new Date(2026, 4, 31))).toBe(6)
  })
})

// ─── classConflictsWithSchedule ──────────────────────────────────────────────

// 2027-06-07 is a Monday — far enough in the future to pass the "past date" guard
const FUTURE_MONDAY = '2027-06-07'
// 2027-06-08 is a Tuesday
const FUTURE_TUESDAY = '2027-06-08'

test.describe('classConflictsWithSchedule — suelta (single date)', () => {
  test('busy block at the class hour → conflict', () => {
    const blocks: BusyBlock[] = [{ weekday: 0, hour: 19 }] // Monday 19:00
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY, time: '19:00' },
        blocks,
        0,
        8,
      ),
    ).toBe(true)
  })

  test('no block at the class hour → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY, time: '10:00' },
        [],
        0,
        8,
      ),
    ).toBe(false)
  })

  test('class falls inside default sleep window (03:00) → conflict', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY, time: '03:00' },
        [],
        0,
        8,
      ),
    ).toBe(true)
  })

  test('past date → no conflict (guard applies)', () => {
    const blocks: BusyBlock[] = [{ weekday: 2, hour: 19 }]
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: '2020-01-01', time: '19:00' },
        blocks,
        0,
        8,
      ),
    ).toBe(false)
  })

  test('class during midnight-crossing sleep (01:00, sleep 23–07) → conflict', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY, time: '01:00' },
        [],
        23,
        7,
      ),
    ).toBe(true)
  })

  test('class outside midnight-crossing sleep (12:00, sleep 23–07) → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY, time: '12:00' },
        [],
        23,
        7,
      ),
    ).toBe(false)
  })

  test('missing time field → no conflict (cannot determine hour)', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'suelta', date: FUTURE_MONDAY },
        [{ weekday: 0, hour: 0 }],
        0,
        8,
      ),
    ).toBe(false)
  })
})

test.describe('classConflictsWithSchedule — periodica (recurring)', () => {
  // day_of_week uses JS convention: 0=Sun, 1=Mon, 2=Tue, …, 6=Sat
  // Our mapping: jsDay === 0 ? 6 : jsDay - 1
  // day_of_week=2 (Tue in JS) → weekday=1 (Tue in our Mon-based encoding)

  test('busy block matches the periodic day+hour → conflict', () => {
    const blocks: BusyBlock[] = [{ weekday: 1, hour: 18 }] // Tuesday 18:00
    expect(
      classConflictsWithSchedule(
        { type: 'periodica', day_of_week: 2, recurring_time: '18:00' },
        blocks,
        0,
        8,
      ),
    ).toBe(true)
  })

  test('no block on that day → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        { type: 'periodica', day_of_week: 4, recurring_time: '15:00' },
        [],
        0,
        8,
      ),
    ).toBe(false)
  })

  test('periodic class during sleep window → conflict', () => {
    // day_of_week=1 (Mon in JS) → weekday=0; hour=6 inside [0,8) sleep
    expect(
      classConflictsWithSchedule(
        { type: 'periodica', day_of_week: 1, recurring_time: '06:00' },
        [],
        0,
        8,
      ),
    ).toBe(true)
  })

  test('day_of_week=0 (Sunday in JS) → weekday=6 in our schema', () => {
    const blocks: BusyBlock[] = [{ weekday: 6, hour: 10 }] // Sunday 10:00
    expect(
      classConflictsWithSchedule(
        { type: 'periodica', day_of_week: 0, recurring_time: '10:00' },
        blocks,
        0,
        8,
      ),
    ).toBe(true)
  })
})

test.describe('classConflictsWithSchedule — custom recurrence', () => {
  test('at least one upcoming custom date conflicts → conflict', () => {
    // 2027-06-07 is Monday → weekday 0; mark Monday 20:00 busy
    const blocks: BusyBlock[] = [{ weekday: 0, hour: 20 }]
    expect(
      classConflictsWithSchedule(
        {
          type: 'custom',
          recurrence: 'custom',
          custom_dates: [FUTURE_MONDAY, FUTURE_TUESDAY],
          recurring_time: '20:00',
        },
        blocks,
        0,
        8,
      ),
    ).toBe(true)
  })

  test('no block on any upcoming date → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        {
          type: 'custom',
          recurrence: 'custom',
          custom_dates: [FUTURE_MONDAY, FUTURE_TUESDAY],
          recurring_time: '10:00',
        },
        [],
        0,
        8,
      ),
    ).toBe(false)
  })

  test('all custom dates are in the past → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        {
          type: 'custom',
          recurrence: 'custom',
          custom_dates: ['2020-01-06', '2020-01-13'],
          recurring_time: '20:00',
        },
        [],
        0,
        8,
      ),
    ).toBe(false)
  })

  test('empty custom_dates → no conflict', () => {
    expect(
      classConflictsWithSchedule(
        {
          type: 'custom',
          recurrence: 'custom',
          custom_dates: [],
          recurring_time: '20:00',
        },
        [{ weekday: 0, hour: 20 }],
        0,
        8,
      ),
    ).toBe(false)
  })
})
