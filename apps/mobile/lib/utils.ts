// Parse a YYYY-MM-DD string as local midnight (avoids UTC off-by-one).
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Returns all session dates (YYYY-MM-DD) for a class within [fromDate, toDate].
 * Handles suelta, weekly, biweekly, monthly, and custom recurrences.
 */
export function getClassSessions(classData: any, fromDate: Date, toDate: Date): string[] {
  const results: string[] = []
  const fromYMD = toYMD(fromDate)
  const toYMDStr = toYMD(toDate)

  if (classData.type === 'suelta') {
    if (classData.date && classData.date >= fromYMD && classData.date <= toYMDStr) {
      results.push(classData.date)
    }
    return results
  }

  if (classData.recurrence === 'custom') {
    for (const d of classData.custom_dates ?? []) {
      if (d >= fromYMD && d <= toYMDStr) results.push(d)
    }
    return results.sort()
  }

  let start: Date
  if (classData.start_date) {
    start = parseLocalDate(classData.start_date)
  } else if (classData.day_of_week != null) {
    // start_date not stored — derive anchor from day_of_week (0=Sun..6=Sat)
    const targetDay = classData.day_of_week as number
    start = new Date(fromDate)
    const dayDiff = (start.getDay() - targetDay + 7) % 7
    start.setDate(start.getDate() - dayDiff)
  } else {
    return results
  }

  let endDate: Date
  if (classData.ends_indefinitely) {
    const cap = new Date(fromDate)
    cap.setMonth(cap.getMonth() + 3)
    endDate = cap < toDate ? cap : toDate
  } else if (classData.ends_at) {
    endDate = parseLocalDate(classData.ends_at)
    if (endDate > toDate) endDate = toDate
  } else {
    endDate = toDate
  }

  if (classData.recurrence === 'weekly' || classData.recurrence === 'biweekly') {
    const step = classData.recurrence === 'biweekly' ? 14 : 7
    const cur = new Date(start)
    while (cur < fromDate) cur.setDate(cur.getDate() + step)
    while (cur <= endDate) {
      const ymd = toYMD(cur)
      if (ymd >= fromYMD) results.push(ymd)
      cur.setDate(cur.getDate() + step)
    }
    return results
  }

  if (classData.recurrence === 'monthly') {
    const dayOfMonth = start.getDate()
    const cur = new Date(start)
    while (cur < fromDate) cur.setMonth(cur.getMonth() + 1)
    while (cur <= endDate) {
      const year = cur.getFullYear()
      const month = cur.getMonth()
      const lastDay = new Date(year, month + 1, 0).getDate()
      const actualDay = Math.min(dayOfMonth, lastDay)
      const session = new Date(year, month, actualDay)
      if (session >= fromDate && session <= endDate) {
        results.push(toYMD(session))
      }
      cur.setMonth(cur.getMonth() + 1)
    }
    return results
  }

  return results
}

export function formatTime(time: string): string {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}
