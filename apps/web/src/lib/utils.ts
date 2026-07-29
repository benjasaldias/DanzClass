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

export function formatTime(time: string | null | undefined): string {
  // Tolera la ausencia de hora en vez de lanzar: `recurring_time` es NULLABLE, y
  // una sola fila sin hora hacía que `null.split(':')` tirara una excepción no
  // capturada **durante el render de una tarjeta del feed**, o sea que tumbaba
  // el feed entero —para todos— por culpa de una clase mal cargada. Lo destapó
  // el smoke de S7 con datos sembrados por otras pruebas.
  if (!time) return ''
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

// El motor de fechas de una clase vive en `packages/shared` (D-5): antes existía
// una copia acá y otra en `apps/mobile/lib/utils.ts`, y ya habían divergido.
// Se re-exportan para no romper los imports existentes desde `@/lib/utils`.
export {
  parseLocalDate,
  toYMD,
  getClassSessions,
  lastSessionEnd,
  getClassDeletionDate,
} from '@danceclass/shared'
