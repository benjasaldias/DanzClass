import { createAdminClient } from './supabase/admin'
import { summarizeCharges, type MonthlyCharge, type DebtSummary } from '@danceclass/shared'
import { logger } from './logger'

type AdminClient = ReturnType<typeof createAdminClient>

// Lado servidor del cobro mensual de entrenamientos (migración 068).
// La lógica de "qué debe el alumno" vive en packages/shared
// (`summarizeCharges`); acá sólo está el acceso a la base, compartido por
// `/api/payment/submit-transfer`, `/api/mercadopago/create-payment`,
// `/api/payment/confirm` y la pantalla de pago.

/**
 * Emite los cargos mensuales que le falten a esta inscripción.
 *
 * El cron diario hace lo mismo para todas, pero se llama también acá para que
 * el alumno que entra a pagar el mismo día en que se inscribió (o el día
 * siguiente al `billing_day`, antes de que corra el cron) vea su deuda al
 * instante en vez de una pantalla vacía. Es idempotente: la unicidad de
 * `payments_one_per_period` la vuelve un no-op si los cargos ya existen.
 *
 * Best-effort: si falla, la pantalla muestra los cargos que ya existían en vez
 * de romperse.
 */
export async function ensureMonthlyCharges(
  admin: AdminClient,
  enrollmentId: string
): Promise<void> {
  const { error } = await (admin as any).rpc('generate_monthly_charges', {
    p_enrollment_id: enrollmentId,
  })
  if (error) {
    logger.error('monthly_charges_generate_failed', error.message, { enrollment_id: enrollmentId })
  }
}

/** Cargos mensuales de una inscripción (sin los pagos únicos, que no tienen período). */
export async function loadMonthlyCharges(
  admin: AdminClient,
  enrollmentId: string
): Promise<MonthlyCharge[]> {
  const { data } = await (admin as any)
    .from('payments')
    .select('id, billing_period, amount, status, receipt_url, offline_confirmed, payment_method')
    .eq('enrollment_id', enrollmentId)
    .not('billing_period', 'is', null)
    .order('billing_period', { ascending: true })

  return (data ?? []) as MonthlyCharge[]
}

/** Emite los cargos faltantes y devuelve el resumen de deuda ya calculado. */
export async function getDebtSummary(
  admin: AdminClient,
  enrollmentId: string,
  billingDay: number
): Promise<DebtSummary> {
  await ensureMonthlyCharges(admin, enrollmentId)
  return summarizeCharges(await loadMonthlyCharges(admin, enrollmentId), billingDay)
}

export type ChargeResolution =
  | { ok: true; charges: MonthlyCharge[] }
  | { ok: false; error: 'no_debt' | 'charge_not_found' | 'charge_already_paid' }

/**
 * Resuelve qué cargos va a pagar el alumno.
 *
 * - Sin `requestedIds`: el cargo impago MÁS ANTIGUO. Pagar de atrás hacia
 *   adelante es lo que hace que la deuda se destrabe (el vencido es el que
 *   bloquea el QR) y evita que alguien pague el mes en curso y siga sin acceso.
 * - Con `requestedIds`: exactamente esos, validados contra la inscripción. Los
 *   ids que no existan o ya estén pagados se rechazan en vez de ignorarse en
 *   silencio: el alumno está por transferir dinero contra un total que vio en
 *   pantalla, y ese total tiene que ser el que se registra.
 */
export function resolveChargesToPay(
  debt: DebtSummary,
  requestedIds?: string[] | null
): ChargeResolution {
  if (!requestedIds || requestedIds.length === 0) {
    if (!debt.oldestUnpaid) return { ok: false, error: 'no_debt' }
    return { ok: true, charges: [debt.oldestUnpaid] }
  }

  const unique = Array.from(new Set(requestedIds))
  const byId = new Map(debt.charges.map((c) => [c.id, c]))
  const picked: MonthlyCharge[] = []

  for (const id of unique) {
    const charge = byId.get(id)
    if (!charge) return { ok: false, error: 'charge_not_found' }
    if (!debt.unpaid.some((c) => c.id === id)) return { ok: false, error: 'charge_already_paid' }
    picked.push(charge)
  }

  picked.sort((a, b) => a.billing_period.localeCompare(b.billing_period))
  return { ok: true, charges: picked }
}
