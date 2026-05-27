import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

export function formatDate(date: string): string {
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight, which shifts to the previous day in UTC- timezones.
  // Parse them as local time by constructing the Date from parts.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? (() => { const [y, m, day] = date.split('-').map(Number); return new Date(y, m - 1, day) })()
    : new Date(date)
  return format(d, "d 'de' MMMM, yyyy", { locale: es })
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function getInitials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return ''
  return parts
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Parse a YYYY-MM-DD string as local midnight (avoids UTC off-by-one).
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYMD(date: Date): string {
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
  const toYMD_ = toYMD(toDate)

  if (classData.type === 'suelta') {
    if (classData.date && classData.date >= fromYMD && classData.date <= toYMD_) {
      results.push(classData.date)
    }
    return results
  }

  if (classData.recurrence === 'custom') {
    for (const d of classData.custom_dates ?? []) {
      if (d >= fromYMD && d <= toYMD_) results.push(d)
    }
    return results.sort()
  }

  // Periodic: weekly, biweekly, monthly
  let start: Date
  if (classData.start_date) {
    start = parseLocalDate(classData.start_date)
  } else if (classData.day_of_week != null) {
    // Fallback "ancla virtual": deriva el inicio desde el día de la semana cuando start_date no existe.
    // Para biweekly esto puede mostrar la semana equivocada (fase desconocida).
    // Toda clase nueva debería persistir start_date (migración 024). Si vemos este path, hay registros legacy.
    if (typeof console !== 'undefined' && classData.recurrence === 'biweekly') {
      console.warn('[getClassSessions] virtual anchor fallback used for class', classData.id, 'recurrence=biweekly — biweekly phase may be wrong')
    }
    const targetDay = classData.day_of_week as number
    start = new Date(fromDate)
    const dayDiff = (start.getDay() - targetDay + 7) % 7
    start.setDate(start.getDate() - dayDiff)
  } else {
    return results
  }

  // Determine effective end
  let endDate: Date
  if (classData.ends_indefinitely) {
    // Cap at fromDate + 3 months for safety
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
    // Advance to fromDate if start is before window
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
    // Advance to a month on or after fromDate
    while (cur < fromDate) cur.setMonth(cur.getMonth() + 1)
    while (cur <= endDate) {
      // Clamp to last valid day of the month
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
