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
