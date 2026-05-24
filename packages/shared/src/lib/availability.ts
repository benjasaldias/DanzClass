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

/**
 * Returns true if a class conflicts with the user's occupied schedule.
 * Handles suelta (single date), periodica (weekly/biweekly/monthly), and custom recurrences.
 *
 * classData must have: type, date?, time?, day_of_week?, recurring_time?, recurrence?, custom_dates?
 * busyBlocks: array of {weekday, hour} (0=Mon, 6=Sun)
 * sleepStart/sleepEnd: 0-23
 */
export function classConflictsWithSchedule(
  classData: {
    type: string
    date?: string | null
    time?: string | null
    day_of_week?: number | null
    recurring_time?: string | null
    recurrence?: string | null
    custom_dates?: string[] | null
  },
  busyBlocks: BusyBlock[],
  sleepStart: number,
  sleepEnd: number,
): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function getHourFromTime(timeStr: string | null | undefined): number | null {
    if (!timeStr) return null
    return parseInt(timeStr.split(':')[0], 10)
  }

  function weekdayFromDateStr(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return dateToWeekday(new Date(y, m - 1, d))
  }

  if (classData.type === 'suelta') {
    if (!classData.date) return false
    const [y, m, d] = classData.date.split('-').map(Number)
    const classDate = new Date(y, m - 1, d)
    if (classDate < today) return false
    const wd = dateToWeekday(classDate)
    const hour = getHourFromTime(classData.time)
    if (hour === null) return false
    return isBlockOccupied(wd, hour, busyBlocks, sleepStart, sleepEnd)
  }

  if (classData.recurrence === 'custom') {
    const upcomingDates = (classData.custom_dates ?? []).filter((d) => {
      const [y, m, day] = d.split('-').map(Number)
      return new Date(y, m - 1, day) >= today
    })
    if (upcomingDates.length === 0) return false
    const hour = getHourFromTime(classData.recurring_time)
    if (hour === null) return false
    return upcomingDates.some((d) => isBlockOccupied(weekdayFromDateStr(d), hour, busyBlocks, sleepStart, sleepEnd))
  }

  // Periodic (weekly, biweekly, monthly): check the day_of_week
  if (classData.day_of_week !== null && classData.day_of_week !== undefined) {
    const jsDay = classData.day_of_week // 0=Sun in JS convention
    const wd = jsDay === 0 ? 6 : jsDay - 1
    const hour = getHourFromTime(classData.recurring_time)
    if (hour === null) return false
    return isBlockOccupied(wd, hour, busyBlocks, sleepStart, sleepEnd)
  }

  return false
}
