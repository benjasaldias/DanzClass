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
