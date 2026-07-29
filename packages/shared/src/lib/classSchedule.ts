// Fuente única de verdad del calendario de una clase.
//
// Antes de la sesión S3 del audit, la misma lógica vivía en cuatro copias
// independientes (D-5): `getClassSessions` en `apps/web/src/lib/utils.ts` y su
// gemelo en `apps/mobile/lib/utils.ts`, `lastSessionEnd` en el cron de limpieza
// y `getClassDeletionDate` en la page de "Mis clases". Ya habían divergido: la
// rama `monthly` de mobile avanzaba con `setMonth`, que desborda cuando el día
// del mes es 29–31 (31 de enero + 1 mes = 3 de marzo), mientras que la de web
// lleva año/mes como enteros y lo evita. Todo consumidor nuevo debe importar
// desde acá, no reimplementar.

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Forma mínima de una fila de `classes` que necesita el motor de fechas. */
export interface ClassScheduleData {
  id?: string
  type?: string | null
  /** 'weekly' | 'biweekly' | 'monthly' | 'custom' */
  recurrence?: string | null
  date?: string | null
  time?: string | null
  start_date?: string | null
  day_of_week?: number | null
  recurring_time?: string | null
  custom_dates?: string[] | null
  ends_at?: string | null
  ends_indefinitely?: boolean | null
  duration_minutes?: number | null
}

/**
 * Devuelve todas las fechas de sesión (YYYY-MM-DD) de una clase dentro de
 * [fromDate, toDate]. Cubre suelta, weekly, biweekly, monthly y custom.
 *
 * Desde la migración `067` las clases `type='periodica'` son siempre `custom`;
 * las ramas periódicas quedan vivas para los entrenamientos (que conservan
 * weekly/biweekly) y para leer datos históricos.
 */
export function getClassSessions(
  classData: ClassScheduleData,
  fromDate: Date,
  toDate: Date,
): string[] {
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

  // Periódicas sin calendario explícito: weekly, biweekly, monthly.
  let start: Date
  if (classData.start_date) {
    start = parseLocalDate(classData.start_date)
  } else if (classData.day_of_week != null) {
    // Fallback "ancla virtual": deriva el inicio desde el día de la semana cuando
    // start_date no existe. Para biweekly puede mostrar la semana equivocada
    // (la fase es desconocida). Toda clase nueva persiste start_date (migración
    // 024); si se llega acá, hay registros legacy.
    if (typeof console !== 'undefined' && classData.recurrence === 'biweekly') {
      console.warn('[getClassSessions] virtual anchor fallback used for class', classData.id, 'recurrence=biweekly — biweekly phase may be wrong')
    }
    const targetDay = classData.day_of_week
    start = new Date(fromDate)
    const dayDiff = (start.getDay() - targetDay + 7) % 7
    start.setDate(start.getDate() - dayDiff)
  } else {
    return results
  }

  // Fin efectivo de la ventana.
  let endDate: Date
  if (classData.ends_indefinitely) {
    // Tope de seguridad: 3 meses desde el inicio de la ventana consultada.
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
    // Año/mes como enteros: `setMonth` desborda cuando el día es 29–31
    // (31 de enero + 1 mes = 3 de marzo).
    let year = start.getFullYear()
    let month = start.getMonth()
    const fromYM = fromDate.getFullYear() * 12 + fromDate.getMonth()
    while (year * 12 + month < fromYM) {
      month++; if (month > 11) { month = 0; year++ }
    }
    let safety = 0
    while (safety++ < 120) {
      const lastDay = new Date(year, month + 1, 0).getDate()
      const actualDay = Math.min(dayOfMonth, lastDay)
      const session = new Date(year, month, actualDay)
      if (session > endDate) break
      if (session >= fromDate) results.push(toYMD(session))
      month++; if (month > 11) { month = 0; year++ }
    }
    return results
  }

  return results
}

/**
 * Fin (incluida la duración) de la última sesión de una clase, en hora local.
 * Null cuando no es determinable: clase indefinida, o sin fechas.
 */
export function lastSessionEnd(cls: ClassScheduleData): Date | null {
  const durMs = (cls.duration_minutes ?? 60) * 60 * 1000
  const at = (ymd: string, hm: string | null | undefined): Date => {
    const [y, mo, d] = ymd.split('-').map(Number)
    const [h = 0, m = 0] = (hm ?? '00:00').split(':').map(Number)
    const dt = new Date(y, mo - 1, d, h, m)
    dt.setTime(dt.getTime() + durMs)
    return dt
  }

  if (cls.type === 'suelta') {
    return cls.date ? at(cls.date, cls.time) : null
  }

  if (cls.recurrence === 'custom' || (cls.custom_dates?.length ?? 0) > 0) {
    const dates = cls.custom_dates ?? []
    if (dates.length === 0) return null
    const last = [...dates].sort()[dates.length - 1]
    return at(last, cls.recurring_time ?? cls.time)
  }

  // Periódica / entrenamiento sin calendario explícito.
  if (cls.ends_indefinitely) return null
  if (!cls.ends_at) return null
  return at(cls.ends_at, cls.recurring_time)
}

/** Horas de gracia entre la última sesión y el archivado de los archivos pesados. */
export const CLASS_ARCHIVE_GRACE_HOURS = 24

/**
 * Fecha en que se archivan los archivos pesados de la clase: 24 h después de su
 * última sesión. Null para clases indefinidas o sin fecha determinable.
 */
export function getClassDeletionDate(cls: ClassScheduleData): Date | null {
  const end = lastSessionEnd(cls)
  if (!end) return null
  return new Date(end.getTime() + CLASS_ARCHIVE_GRACE_HOURS * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Regla de un mes para clases periódicas (decisión de producto, sesión S3)
// ---------------------------------------------------------------------------
//
// Una clase `type='periodica'` define sus fechas SOLO por calendario
// (`recurrence='custom'`) y todas deben caer dentro de un mismo mes calendario.
// Los entrenamientos quedan fuera de esta regla: son programas continuos y
// conservan weekly/biweekly con fecha de término o indefinido.

/** Mes calendario (YYYY-MM) de una fecha YYYY-MM-DD. */
export function calendarMonthOf(ymd: string): string {
  return ymd.slice(0, 7)
}

/** True si todas las fechas caen en el mismo mes calendario (0 o 1 fecha → true). */
export function datesWithinOneCalendarMonth(dates: string[]): boolean {
  if (dates.length <= 1) return true
  const first = calendarMonthOf(dates[0])
  return dates.every((d) => calendarMonthOf(d) === first)
}

/**
 * Valida las fechas de una clase periódica. Devuelve el mensaje de error a
 * mostrar, o null si son válidas.
 *
 * `allowMultiMonth` existe para las clases heredadas: la migración `067`
 * convirtió las weekly/biweekly ya publicadas expandiendo TODAS sus
 * ocurrencias, así que muchas abarcan varios meses. Bloquear su edición
 * dejaría al profesor sin poder tocar el precio de una clase con alumnos
 * pagando. La regla se aplica solo cuando el profesor modifica el calendario.
 */
export function validatePeriodicaDates(
  dates: string[],
  opts: { allowMultiMonth?: boolean } = {},
): string | null {
  if (dates.length === 0) return 'Selecciona al menos una fecha en el calendario'
  // Round-trip en vez de `isNaN(new Date(...))`: el chequeo que se usaba antes
  // en los formularios daba por buena una fecha imposible como '2026-02-31',
  // porque el motor la corre al 3 de marzo en lugar de rechazarla.
  const invalid = dates.find((d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true
    const parsed = parseLocalDate(d)
    return isNaN(parsed.getTime()) || toYMD(parsed) !== d
  })
  if (invalid) return `Fecha inválida: ${invalid}`
  if (!opts.allowMultiMonth && !datesWithinOneCalendarMonth(dates)) {
    return 'Las clases periódicas no pueden extenderse más de un mes: todas las fechas deben estar dentro de un mismo mes.'
  }
  return null
}

/** Última fecha del calendario (YYYY-MM-DD), o null si no hay ninguna. */
export function lastCustomDate(dates: string[] | null | undefined): string | null {
  const list = (dates ?? []).filter(Boolean)
  if (list.length === 0) return null
  return [...list].sort()[list.length - 1]
}

// ---------------------------------------------------------------------------
// start_date
// ---------------------------------------------------------------------------
//
// start_date es el ANCLA de todo el cálculo de sesiones: para weekly/biweekly el
// motor avanza de 7 en 7 (o 14 en 14) DESDE esa fecha, así que tiene que caer
// justo en el día de la semana de la clase o las sesiones quedan corridas.

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

  const base = startDate ? parseLocalDate(startDate) : today ? parseLocalDate(today) : new Date()

  if (recurrence === 'monthly') return toYMD(base)

  if (dayOfWeek === null || dayOfWeek === undefined || isNaN(dayOfWeek)) return null

  const diff = (dayOfWeek - base.getDay() + 7) % 7
  base.setDate(base.getDate() + diff)
  return toYMD(base)
}
