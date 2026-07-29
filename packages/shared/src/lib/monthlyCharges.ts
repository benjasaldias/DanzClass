// Cargos mensuales de entrenamiento — deuda acumulada (audit.md S4).
//
// Un entrenamiento cobra todos los meses (`classes.billing_day`). Cada mes se
// emite un CARGO: una fila de `payments` con `billing_period = 'YYYY-MM'`
// (migración 068). Los meses impagos se acumulan; ninguno se cancela ni se
// borra, y la inscripción del alumno nunca se cancela por impago — la única
// consecuencia es perder el QR de acceso a la clase.
//
// Este módulo es la ÚNICA fuente de verdad de "qué debe el alumno" para web,
// mobile y el gate del QR. Es lógica pura sobre filas ya leídas: no consulta la
// base y no depende del cliente de Supabase.
//
// `billing_period IS NOT NULL` es el discriminador: una fila de `payments` con
// período es un cargo mensual de entrenamiento; sin período es un pago único
// (clase suelta, periódica, 2x, paquete), como siempre.

export type ChargeStatus = 'due' | 'pending' | 'verified' | 'rejected' | 'void' | 'refunded'

export interface MonthlyCharge {
  id: string
  /** 'YYYY-MM' */
  billing_period: string
  amount: number
  status: ChargeStatus
  receipt_url?: string | null
  offline_confirmed?: boolean | null
  payment_method?: string | null
}

/**
 * Días de gracia entre el día de cobro y el momento en que el cargo bloquea el
 * QR de acceso. El alumno que quiere pagar sube su comprobante y pasa a
 * 'pending' (que nunca bloquea), así que la gracia sólo cubre al que todavía no
 * alcanzó a hacerlo — típicamente porque paga en efectivo en la clase misma.
 *
 * `classes.billing_day` está acotado a 1..27 (migración 025), así que sumar la
 * gracia nunca desborda al mes siguiente.
 */
export const MONTHLY_CHARGE_GRACE_DAYS = 3

/**
 * Estados de un cargo que representan deuda (el alumno todavía no pagó).
 * `refunded` cuenta como deuda: Mercado Pago le devolvió el dinero, así que el
 * mes vuelve a estar impago (ver P2-6 del audit).
 */
const UNPAID: ChargeStatus[] = ['due', 'rejected', 'refunded']

/**
 * Normaliza el embed `payment:payments(*)` de PostgREST a lista.
 *
 * Hasta la migración 068 `payments` tenía `UNIQUE(enrollment_id)`, así que
 * PostgREST resolvía ese embed como OBJETO. Al partir esa constraint en dos
 * índices únicos PARCIALES (para permitir un cargo por mes en entrenamientos),
 * PostgREST deja de reconocer la relación como uno-a-uno y devuelve ARRAY.
 * El cambio es silencioso: no rompe el build ni lanza en runtime, simplemente
 * `enrollment.payment.status` queda `undefined`. Todo consumidor pasa por acá.
 */
export function paymentList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function localYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Fecha de hoy en Chile como 'YYYY-MM-DD' (en-CA emite formato ISO).
 *
 * Los usos AUTORITATIVOS de esta fecha son de servidor —la emisión de cargos
 * (que en realidad la calcula Postgres con `AT TIME ZONE`) y el gate del QR en
 * `/api/attendance/scan`—, donde Node tiene ICU completo. En mobile se usa sólo
 * para pintar la pantalla, y Hermes no garantiza soporte de `timeZone` en
 * `Intl`: si falta, se cae a la fecha local del dispositivo (idéntica para un
 * usuario en Chile, que es el único mercado hoy) en vez de lanzar.
 */
export function todayInChile(now: Date = new Date()): string {
  try {
    const out = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : localYMD(now)
  } catch {
    return localYMD(now)
  }
}

/** Período de facturación ('YYYY-MM') correspondiente a un momento dado, en Chile. */
export function billingPeriodOf(now: Date = new Date()): string {
  return todayInChile(now).slice(0, 7)
}

/** Período siguiente/anterior ('YYYY-MM' → 'YYYY-MM'), sin depender de Date. */
export function shiftBillingPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = total - year * 12 + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/**
 * Último día (inclusive) en que el cargo del período puede pagarse sin perder
 * el acceso: el día de cobro más los días de gracia. 'YYYY-MM-DD'.
 */
export function chargeDueDate(period: string, billingDay: number): string {
  const day = Math.min(Math.max(Math.trunc(billingDay) || 1, 1), 27) + MONTHLY_CHARGE_GRACE_DAYS
  return `${period}-${String(day).padStart(2, '0')}`
}

/**
 * ¿Este cargo está vencido hoy? Vencido = impago (`due`/`rejected`) y ya pasó
 * su fecha de vencimiento. Un cargo en `pending` (comprobante subido, esperando
 * revisión del profesor) NUNCA está vencido: el alumno ya hizo su parte y el
 * retraso es de la revisión.
 */
export function isChargeOverdue(
  charge: Pick<MonthlyCharge, 'billing_period' | 'status'>,
  billingDay: number,
  today: string = todayInChile()
): boolean {
  if (!UNPAID.includes(charge.status)) return false
  return today > chargeDueDate(charge.billing_period, billingDay)
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * 'Julio 2026' — para mostrarle el mes al alumno y al profesor.
 * Sin `Intl`: mobile (Hermes) no garantiza catálogo de locales completo, y el
 * formato de `es-CL` ("julio de 2026") es más largo de lo que caben las filas.
 */
export function formatBillingPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const name = MONTH_NAMES[(m || 0) - 1]
  if (!y || !name) return period
  return `${name} ${y}`
}

export interface DebtSummary {
  /** Todos los cargos vigentes (sin los anulados), del más antiguo al más nuevo. */
  charges: MonthlyCharge[]
  /** Impagos: `due` o `rejected`. */
  unpaid: MonthlyCharge[]
  /** Impagos cuya fecha de vencimiento ya pasó — los que bloquean el QR. */
  overdue: MonthlyCharge[]
  /** Comprobante enviado, esperando revisión del profesor. */
  inReview: MonthlyCharge[]
  /** Pagados y confirmados. */
  paid: MonthlyCharge[]
  totalUnpaid: number
  totalOverdue: number
  totalInReview: number
  /** true → el alumno pierde el acceso por QR hasta ponerse al día. */
  hasOverdue: boolean
  /** El cargo impago más antiguo: el que corresponde pagar primero. */
  oldestUnpaid: MonthlyCharge | null
}

/**
 * Resume la deuda de una inscripción de entrenamiento a partir de sus cargos.
 *
 * Los pagos SIN `billing_period` se ignoran: no son cargos mensuales (pueden ser
 * el pago único de otra clase si el llamador mezcló filas). Los `void` se
 * descartan por completo: son cargos anulados, no deuda ni historial de pago.
 */
export function summarizeCharges(
  rows: MonthlyCharge[],
  billingDay: number,
  today: string = todayInChile()
): DebtSummary {
  const charges = rows
    .filter((c) => !!c.billing_period && c.status !== 'void')
    .sort((a, b) => a.billing_period.localeCompare(b.billing_period))

  const unpaid = charges.filter((c) => UNPAID.includes(c.status))
  const overdue = unpaid.filter((c) => isChargeOverdue(c, billingDay, today))
  const inReview = charges.filter((c) => c.status === 'pending')
  const paid = charges.filter((c) => c.status === 'verified')
  const sum = (list: MonthlyCharge[]) => list.reduce((acc, c) => acc + (c.amount || 0), 0)

  return {
    charges,
    unpaid,
    overdue,
    inReview,
    paid,
    totalUnpaid: sum(unpaid),
    totalOverdue: sum(overdue),
    totalInReview: sum(inReview),
    hasOverdue: overdue.length > 0,
    oldestUnpaid: unpaid[0] ?? null,
  }
}
