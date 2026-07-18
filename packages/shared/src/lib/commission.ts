// Comisión de plataforma para pagos in-app (Mercado Pago) de alumnos SIN plan.
//
// Modelo de negocio (sesión 2026-07-17): un alumno sin suscripción puede
// inscribirse pagando la clase por Mercado Pago dentro de la app. DanzClass
// retiene una comisión y el resto se liquida al profesor vía split de MP.
// Los alumnos con plan (basic o superior) NO pagan comisión (y además pueden
// usar transferencia directa al profesor).

import type { SubscriptionTier } from '../types/index'

/** Tasa de comisión sobre el monto de la clase. */
export const COMMISSION_RATE = 0.02 // 2%
/** Tope máximo de comisión por pago, en CLP. */
export const COMMISSION_CAP_CLP = 700

/**
 * Comisión de plataforma en CLP para un monto de clase dado.
 * 2% del monto, redondeado a peso entero, con tope de $700.
 * `amount` es el precio efectivo que paga el alumno (ya con descuento si aplica).
 * Devuelve 0 para montos no positivos o inválidos.
 */
export function platformCommission(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.min(Math.round(amount * COMMISSION_RATE), COMMISSION_CAP_CLP)
}

/**
 * Si un alumno con este tier paga comisión al inscribirse por Mercado Pago.
 * Solo los alumnos sin plan ('none') pagan comisión.
 */
export function paysCommission(tier: SubscriptionTier): boolean {
  return tier === 'none'
}

/**
 * Si un alumno con este tier puede usar transferencia directa al profesor.
 * La transferencia directa está reservada a alumnos con plan (basic o superior);
 * los alumnos sin plan solo pueden pagar in-app por Mercado Pago.
 */
export function canPayByTransfer(tier: SubscriptionTier): boolean {
  return tier !== 'none'
}

/** Desglose del monto que paga el alumno por Mercado Pago. */
export interface PaymentBreakdown {
  /** Precio de la clase (lo que recibe el profesor). */
  base: number
  /** Comisión de DanzClass (0 si el alumno tiene plan). */
  commission: number
  /** Total que paga el alumno = base + comisión. */
  total: number
}

/**
 * Desglosa el pago in-app: base (para el profe) + comisión (para DanzClass).
 * La comisión se SUMA sobre el precio de la clase — el profesor siempre recibe
 * el precio completo de su clase, y el alumno sin plan paga el extra.
 */
export function paymentBreakdown(amount: number, tier: SubscriptionTier): PaymentBreakdown {
  const base = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
  const commission = paysCommission(tier) ? platformCommission(base) : 0
  return { base, commission, total: base + commission }
}
