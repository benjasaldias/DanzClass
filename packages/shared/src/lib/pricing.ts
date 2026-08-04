// Precio efectivo de una clase (considerando descuentos espontáneos del profesor).
// Única fuente de verdad para web + mobile: display (ClassCard/ClassDetail) y
// cobro (PaymentClient/create-payment) deben calcular el mismo número.

export type ClassRecurrenceType = 'suelta' | 'periodica' | 'entrenamiento' | string

export interface ClassPriceFields {
  type: ClassRecurrenceType
  price: number
  discount_price?: number | null
  discount_price_monthly?: number | null
}

/** Clases con cobro mensual recurrente (vs. clases sueltas de una sola vez). */
export function isPeriodicClass(type: ClassRecurrenceType): boolean {
  return type === 'periodica' || type === 'entrenamiento'
}

/**
 * Precio que realmente paga el alumno hoy: el descuento activo si existe
 * (mensual para periódica/entrenamiento, `discount_price` para suelta), o el
 * precio base si no hay descuento vigente.
 */
export function effectiveClassPrice(cls: ClassPriceFields): number {
  return isPeriodicClass(cls.type)
    ? (cls.discount_price_monthly ?? cls.price)
    : (cls.discount_price ?? cls.price)
}

export interface ClassTwoxPriceFields {
  price_2x?: number | null
  price_suelta_2x?: number | null
}

/**
 * Precio 2x de una clase (un solo pago que cubre a los dos alumnos), o `null`
 * si el profesor no configuró ninguno.
 *
 * `price_2x` es el 2x de la clase (suelta o del cobro mensual) y
 * `price_suelta_2x` el de una sesión suelta dentro de una clase periódica —
 * misma precedencia que ya usan `ClassDetailClient` y `FriendsTwoxList`.
 *
 * El 2x **no** aplica descuentos espontáneos: es un precio propio que el
 * profesor fija aparte (ver `marketplace-payments-plan.md` §9).
 */
export function twoxClassPrice(cls: ClassTwoxPriceFields): number | null {
  return cls.price_2x ?? cls.price_suelta_2x ?? null
}

// ---------------------------------------------------------------------------
// Suscripciones — pago único anual
// ---------------------------------------------------------------------------

/**
 * Descuento del pago único anual frente a pagar 12 meses sueltos.
 *
 * Hasta la sesión 2026-08-02 el anual cobraba `precio * 12` exacto, sin ningún
 * descuento — y la pantalla de mobile igual anunciaba "ahorras $3.000", que era
 * publicidad falsa. Ahora el descuento existe de verdad y sale de acá.
 */
export const ANNUAL_DISCOUNT_RATE = 0.10

/**
 * Precio del pago único anual de un plan, en CLP.
 *
 * ⚠️ **Fuente única**: la usan tanto la UI que anuncia el precio y el ahorro
 * como `/api/mercadopago/create-preference`, que es la que efectivamente cobra.
 * Si alguna vez divergen, se le cobra al usuario un monto distinto del que se
 * le mostró. No recalcular el descuento a mano en ningún consumidor.
 */
export function annualPlanPrice(monthlyPrice: number): number {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return 0
  return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT_RATE))
}

/**
 * Cuánto ahorra el pago anual frente a 12 pagos mensuales, en CLP.
 * Se deriva de `annualPlanPrice` a propósito: cualquier promesa de ahorro en la
 * UI tiene que ser exactamente la diferencia con lo que se cobra.
 */
export function annualPlanSavings(monthlyPrice: number): number {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return 0
  return monthlyPrice * 12 - annualPlanPrice(monthlyPrice)
}
