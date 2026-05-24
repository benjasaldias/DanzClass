export type BusyBlock = { weekday: number; hour: number }

/**
 * Returns true if the given hour falls inside the sleep window.
 * Handles midnight-crossing ranges (e.g. sleepStart=23, sleepEnd=7).
 */
export function isSleepHour(hour: number, sleepStart: number, sleepEnd: number): boolean {
  if (sleepStart === sleepEnd) return false
  if (sleepStart < sleepEnd) return hour >= sleepStart && hour < sleepEnd
  // Crosses midnight
  return hour >= sleepStart || hour < sleepEnd
}

/**
 * Returns true if a given (weekday, hour) slot is occupied —
 * either because it falls in the sleep window or the user marked it busy.
 */
export function isBlockOccupied(
  weekday: number,
  hour: number,
  busyBlocks: BusyBlock[],
  sleepStart: number,
  sleepEnd: number,
): boolean {
  if (isSleepHour(hour, sleepStart, sleepEnd)) return true
  return busyBlocks.some((b) => b.weekday === weekday && b.hour === hour)
}

/**
 * Returns all hours in 0-23 that fall inside the sleep window.
 */
export function getSleepHours(sleepStart: number, sleepEnd: number): number[] {
  return Array.from({ length: 24 }, (_, h) => h).filter((h) =>
    isSleepHour(h, sleepStart, sleepEnd)
  )
}

/**
 * Given a specific date, returns the weekday index (0=Mon … 6=Sun)
 * compatible with the user_busy_blocks schema.
 */
export function dateToWeekday(date: Date): number {
  const jsDay = date.getDay() // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1
}
