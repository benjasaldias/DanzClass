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
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
