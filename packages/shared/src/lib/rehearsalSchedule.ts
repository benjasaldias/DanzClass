/**
 * Caducidad y coordinación de ensayos — fuente única para web, mobile y el cron.
 *
 * Espejo de `rehearsal_expires_at()` en la migración 077. La BASE DE DATOS es la
 * autoridad (un trigger mantiene `rehearsals.expires_at` y ningún caller la
 * escribe); esto existe para que la UI pueda decir "caduca en 3 días" sin ir a
 * preguntar, y para que el cron use la misma regla. Si cambia una, cambia la
 * otra — hay un test que compara los dos resultados.
 */

/** Horas de gracia después de que TERMINA el ensayo. Espejo de v_grace en 077. */
export const REHEARSAL_GRACE_HOURS = 2

export type RehearsalDateShape = {
  date_mode?: string | null
  rehearsal_date?: string | null
  rehearsal_time?: string | null
  custom_dates?: string[] | null
  coordinate_month?: string | null
  duration_minutes?: number | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const YM = /^\d{4}-\d{2}$/

/**
 * Parsea 'YYYY-MM-DD' (+ 'HH:MM' opcional) como hora LOCAL.
 *
 * `new Date('2026-08-14')` es medianoche UTC, que en Chile cae el día anterior —
 * el off-by-one que ya mordió en formatDate, en `isPast` de eventos y en el
 * cálculo de sesiones de clase. No repetirlo acá.
 */
function parseLocal(dateStr: string, timeStr?: string | null): Date | null {
  if (!YMD.test(dateStr)) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  let hh = 0
  let mm = 0
  if (timeStr) {
    const parts = timeStr.split(':')
    hh = Number(parts[0])
    mm = Number(parts[1] ?? 0)
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) { hh = 0; mm = 0 }
  }
  const out = new Date(y, m - 1, d, hh, mm, 0, 0)
  return Number.isNaN(out.getTime()) ? null : out
}

/**
 * Cuándo sale de circulación un ensayo. `null` = no caduca.
 *
 * Las cuatro ramas, en el mismo orden que la función SQL:
 *  1. hay fecha fija (`single`, o `coordinate` ya fijado) → fin + 2 h
 *  2. `custom` → misma regla sobre la última fecha, tomada como fin de día
 *     (ningún formulario captura hora en ese modo)
 *  3. `coordinate` sin fecha → al terminar `coordinate_month`, sin gracia
 *  4. datos insuficientes → null, NO se caduca a ciegas
 */
export function rehearsalExpiresAt(r: RehearsalDateShape): Date | null {
  const duration = r.duration_minutes ?? 60

  if (r.rehearsal_date) {
    const start = parseLocal(r.rehearsal_date, r.rehearsal_time)
    if (!start) return null
    return new Date(start.getTime() + (duration + REHEARSAL_GRACE_HOURS * 60) * 60_000)
  }

  if (r.date_mode === 'custom' && r.custom_dates?.length) {
    const valid = r.custom_dates.filter((d) => YMD.test(d)).sort()
    const last = valid[valid.length - 1]
    if (!last) return null
    const [y, m, d] = last.split('-').map(Number)
    // Fin del último día = medianoche del siguiente, + la gracia.
    const endOfDay = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
    return new Date(endOfDay.getTime() + REHEARSAL_GRACE_HOURS * 3_600_000)
  }

  if (r.date_mode === 'coordinate' && r.coordinate_month && YM.test(r.coordinate_month)) {
    const [y, m] = r.coordinate_month.split('-').map(Number)
    // Inicio del mes siguiente: `new Date(y, 12, 1)` rueda a enero del año
    // próximo sin que haya que tratar diciembre aparte.
    return new Date(y, m, 1, 0, 0, 0, 0)
  }

  return null
}

/** true si el ensayo ya salió de circulación (o debería). */
export function isRehearsalExpired(r: RehearsalDateShape, now: Date = new Date()): boolean {
  const exp = rehearsalExpiresAt(r)
  return exp !== null && exp.getTime() <= now.getTime()
}

/**
 * Un ensayo `coordinate` que ya tiene fecha: la votación se resolvió (o el
 * creador la fijó a mano). Deja de mostrarse como "coordinando".
 */
export function isCoordinationSettled(r: RehearsalDateShape): boolean {
  return r.date_mode === 'coordinate' && !!r.rehearsal_date
}

/**
 * Filtro `.or()` de PostgREST para excluir ensayos caducados.
 *
 * El cron marca `status='expired'` una vez al día, pero un ensayo tiene que
 * desaparecer del feed a las 2 h de terminar, no en la próxima pasada del cron:
 * esto es lo que cubre esas horas. Va SIEMPRE junto a `.eq('status','active')`,
 * no en su lugar — un ensayo cancelado no tiene por qué haber caducado.
 *
 * `expires_at.is.null` primero, porque NULL = no caduca (datos insuficientes) y
 * sin ese término desaparecerían del feed en vez de quedarse.
 */
export function rehearsalNotExpiredFilter(now: Date = new Date()): string {
  return `expires_at.is.null,expires_at.gte.${now.toISOString()}`
}

/** Días que faltan para que caduque. null si no caduca. Negativo = ya caducó. */
export function daysUntilRehearsalExpiry(r: RehearsalDateShape, now: Date = new Date()): number | null {
  const exp = rehearsalExpiresAt(r)
  if (!exp) return null
  return Math.ceil((exp.getTime() - now.getTime()) / 86_400_000)
}

// ────────────────────────────── Display ──────────────────────────────

export const REHEARSAL_MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * "Cuándo es este ensayo", en una línea.
 *
 * Vivía copiado en cinco pantallas (card web, detalle web, card mobile, detalle
 * mobile y "Mis clases"), y las cinco tenían el mismo agujero: preguntaban por
 * `date_mode` antes que por la fecha, así que un ensayo `coordinate` con fecha
 * ya fijada seguía diciendo "Coordinando para agosto". Acá la fecha manda sobre
 * el modo, que es el orden correcto.
 */
export function formatRehearsalWhen(r: RehearsalDateShape): string {
  if (r.rehearsal_date && YMD.test(r.rehearsal_date)) {
    const [y, m, d] = r.rehearsal_date.split('-').map(Number)
    const base = `${d} de ${REHEARSAL_MONTHS_ES[m - 1]} ${y}`
    return r.date_mode === 'coordinate' ? `${base} (fecha fijada)` : base
  }
  if (r.date_mode === 'custom' && r.custom_dates?.length) {
    const sorted = [...r.custom_dates].sort()
    if (sorted.length === 1) {
      const [y, m, d] = sorted[0].split('-').map(Number)
      return `${d} de ${REHEARSAL_MONTHS_ES[m - 1]} ${y}`
    }
    return `${sorted.length} fechas seleccionadas`
  }
  if (r.date_mode === 'coordinate' && r.coordinate_month && YM.test(r.coordinate_month)) {
    const [y, m] = r.coordinate_month.split('-').map(Number)
    return `Coordinando para ${REHEARSAL_MONTHS_ES[m - 1]} ${y}`
  }
  return 'Fecha por coordinar'
}

// ────────────────────────────── Rangos horarios ──────────────────────────────

/** 'HH:MM' o 'HH:MM:SS' → minutos desde medianoche. null si no parsea. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

/** Minutos desde medianoche → 'HH:MM'. */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)))
  const hh = Math.floor(clamped / 60) % 24
  const mm = clamped % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export type ProposalRange = { start_time: string; end_time: string }

/**
 * Qué horas-bloque toca un rango. 12:30–13:35 toca las horas 12 y 13.
 *
 * La disponibilidad se calcula en bloques de 1 h (es la resolución de
 * `user_busy_blocks`), pero el rango propuesto tiene minutos libres. Esta es la
 * traducción entre los dos: un rango es viable para alguien si TODAS las horas
 * que toca lo son.
 */
export function hoursTouchedByRange(range: ProposalRange): number[] {
  const start = timeToMinutes(range.start_time)
  const end = timeToMinutes(range.end_time)
  if (start === null || end === null || end <= start) return []
  const first = Math.floor(start / 60)
  // Un rango que termina justo en la hora en punto (13:00) no ocupa las 13.
  const last = Math.ceil(end / 60) - 1
  const out: number[] = []
  for (let h = first; h <= Math.min(last, 23); h++) out.push(h)
  return out
}

/** Duración del rango en minutos — lo que se guarda como `duration_minutes`. */
export function rangeDurationMinutes(range: ProposalRange): number {
  const start = timeToMinutes(range.start_time)
  const end = timeToMinutes(range.end_time)
  if (start === null || end === null) return 0
  return Math.max(0, end - start)
}

/** '12:30' + '13:35' → '12:30 a 13:35 (1 h 5 min)'. */
export function formatRange(range: ProposalRange): string {
  const mins = rangeDurationMinutes(range)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const dur = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`
  return `${range.start_time.slice(0, 5)} a ${range.end_time.slice(0, 5)} (${dur})`
}

// ────────────────────────────── Votación ──────────────────────────────

export type ProposalStatus = 'open' | 'confirmed' | 'cancelled' | 'expired'

export type ProposalVote = { user_id: string; vote: 'yes' | 'no' }

export type ProposalTally = {
  yes: number
  no: number
  pending: number
  required: number
  reached: boolean
}

/**
 * Conteo de una votación. `memberCount` incluye al creador, que cuenta como
 * confirmado sin votar: propuso el horario, ya dijo que puede.
 */
export function tallyProposal(
  votes: ProposalVote[],
  required: number,
  memberCount: number,
  creatorId?: string | null,
): ProposalTally {
  const seen = new Set<string>()
  let yes = 0
  let no = 0
  for (const v of votes) {
    if (seen.has(v.user_id)) continue
    seen.add(v.user_id)
    if (v.vote === 'yes') yes++
    else no++
  }
  if (creatorId && !seen.has(creatorId)) {
    yes++
    seen.add(creatorId)
  }
  return {
    yes,
    no,
    pending: Math.max(0, memberCount - seen.size),
    required,
    reached: yes >= required,
  }
}

/**
 * Una votación abierta cuya fecha ya pasó no se puede cumplir: la cierra el cron
 * (refinamiento (c) del diseño acordado — sin esto queda abierta para siempre y
 * el ensayo nunca se fija).
 */
export function isProposalStale(
  p: { proposed_date: string; end_time: string; status: string },
  now: Date = new Date(),
): boolean {
  if (p.status !== 'open') return false
  const end = parseLocal(p.proposed_date, p.end_time)
  if (!end) return false
  return end.getTime() <= now.getTime()
}
