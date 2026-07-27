// Resolución del `classes.start_date` que se persiste al crear/editar una clase.
//
// start_date es el ANCLA de todo el cálculo de sesiones (getClassSessions),
// recordatorios del cron, QR de asistencia y cobros: para weekly/biweekly, el
// motor avanza de 7 en 7 (o 14 en 14) DESDE esa fecha, así que tiene que caer
// justo en el día de la semana de la clase o las sesiones quedan corridas.
//
// Antes esto se calculaba en cada formulario como "próxima ocurrencia del día
// elegido a partir de hoy", sin que el profesor pudiera elegir otra cosa. Ahora
// puede indicar desde cuándo parte (obligatorio en Entrenamiento) y esta función
// normaliza esa elección.

function parseYMD(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface ResolveStartDateParams {
  /** 'weekly' | 'biweekly' | 'monthly' | 'custom' */
  recurrence?: string | null
  /** 0 = Domingo … 6 = Sábado (convención de DAYS_OF_WEEK y de Date.getDay()) */
  dayOfWeek?: number | null
  /** Fecha elegida por el profesor (YYYY-MM-DD). Vacío = "parte lo antes posible". */
  startDate?: string | null
  /** Fechas específicas cuando recurrence === 'custom'. */
  customDates?: string[] | null
  /** Hoy (YYYY-MM-DD); inyectable para tests. */
  today?: string
}

/**
 * Devuelve el start_date a persistir, o null si la clase no lo necesita.
 *
 * - custom            → la primera fecha marcada en el calendario.
 * - weekly / biweekly → la fecha elegida ajustada hacia ADELANTE hasta el día de
 *                       la semana de la clase (si el profe elige un martes y la
 *                       clase es los jueves, parte el jueves siguiente). Sin
 *                       fecha elegida, la próxima ocurrencia desde hoy.
 * - monthly           → la fecha elegida tal cual (define el día del mes).
 */
export function resolveClassStartDate({
  recurrence,
  dayOfWeek,
  startDate,
  customDates,
  today,
}: ResolveStartDateParams): string | null {
  if (recurrence === 'custom') {
    const dates = (customDates ?? []).filter(Boolean)
    if (dates.length === 0) return null
    return [...dates].sort()[0]
  }

  const base = startDate ? parseYMD(startDate) : today ? parseYMD(today) : new Date()

  if (recurrence === 'monthly') return toYMD(base)

  if (dayOfWeek === null || dayOfWeek === undefined || isNaN(dayOfWeek)) return null

  const diff = (dayOfWeek - base.getDay() + 7) % 7
  base.setDate(base.getDate() + diff)
  return toYMD(base)
}
