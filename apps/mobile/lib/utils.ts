// El motor de fechas de una clase vive en `packages/shared` (D-5): antes existía
// una copia acá y otra en `apps/web/src/lib/utils.ts`, y ya habían divergido —
// la rama `monthly` de esta copia avanzaba con `setMonth`, que desborda cuando
// el día del mes es 29–31. Se re-exportan para no romper los imports existentes.
export {
  parseLocalDate,
  toYMD,
  getClassSessions,
  lastSessionEnd,
  getClassDeletionDate,
} from '@danceclass/shared'

export function formatTime(time: string | null | undefined): string {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}
