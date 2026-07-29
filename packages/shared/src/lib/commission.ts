// Costos de un pago de clase: comisión de servicio de DanzClass + costo de
// procesamiento de Mercado Pago.
//
// Modelo de negocio (marketplace payments v2, sesión 2026-07-27):
//   * El PROFESOR decide, por clase, qué métodos acepta (MP, transferencia o
//     ambos — ver classes.accepts_mp / accepts_transfer). Cualquier alumno
//     puede usar cualquiera de los métodos habilitados, tenga plan o no.
//   * El PROFESOR RECIBE SIEMPRE EL 100% del precio que fijó, sin importar el
//     método ni el plan del alumno. Nunca absorbe la comisión de Mercado Pago.
//   * La única diferencia por plan es económica: pagando por MP, un alumno SIN
//     plan paga además la comisión de servicio de DanzClass (2%, tope $700);
//     con plan, esa comisión es $0.
//   * Por transferencia no hay comisión de DanzClass para nadie (el dinero se
//     mueve banco a banco, fuera de toda pasarela: no hay mecanismo para
//     cobrarla sin custodiar fondos). El alumno paga exactamente el precio.

import type { SubscriptionTier, PaymentMethod } from '../types/index'

// ---------------------------------------------------------------------------
// Costo de procesamiento de Mercado Pago
// ---------------------------------------------------------------------------

/**
 * Comisión de Mercado Pago (Checkout Pro Chile) sobre el monto total transado.
 * Se usa el tramo de **disponibilidad inmediata** (el más caro de los cuatro
 * que ofrece MP) como tasa fija de plataforma para todos los profesores: la
 * API de MP no expone de forma confiable el plazo de liberación configurado en
 * cada cuenta. Es la elección conservadora — si un profesor tiene liberación a
 * 10/30 días, MP le cobra menos y la diferencia queda a favor de DanzClass;
 * nunca al revés.
 */
export const MP_FEE_RATE = 0.0319
/** IVA (19%) que MP aplica sobre su propia comisión. */
export const MP_FEE_IVA_RATE = 0.19 * MP_FEE_RATE
/** Costo total de MP sobre el monto transado: 3,19% + IVA = 3,7961%. */
export const MP_TOTAL_RATE = MP_FEE_RATE + MP_FEE_IVA_RATE

// ---------------------------------------------------------------------------
// Comisión de servicio de DanzClass
// ---------------------------------------------------------------------------

/** Tasa de comisión de servicio sobre el precio de la clase. */
export const COMMISSION_RATE = 0.02 // 2%
/** Tope máximo de comisión de servicio por pago, en CLP. */
export const COMMISSION_CAP_CLP = 700

/**
 * Comisión de servicio de DanzClass en CLP para un precio de clase dado.
 * 2% del precio, redondeado a peso entero, con tope de $700.
 * `amount` es el precio efectivo de la clase (ya con descuento si aplica).
 * Devuelve 0 para montos no positivos o inválidos.
 */
export function platformCommission(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.min(Math.round(amount * COMMISSION_RATE), COMMISSION_CAP_CLP)
}

/**
 * Si un alumno con este tier paga comisión de servicio al pagar por Mercado
 * Pago. Solo los alumnos sin plan ('none') la pagan. No aplica a transferencia
 * (ver `paymentBreakdown`).
 */
export function paysCommission(tier: SubscriptionTier): boolean {
  return tier === 'none'
}

/**
 * @deprecated Sin llamadores desde la sesión 3 de marketplace v2. La
 * disponibilidad de transferencia es una propiedad de la CLASE
 * (`classes.accepts_transfer`), no del tier del alumno.
 *
 * Corrección: la nota anterior decía que seguía gateando los **paquetes de
 * clases** — es falso. `class_packages` nunca la usó: se gatea con
 * `canEnroll(tier)` en `/api/packages/[id]/enroll`. Esta función es hoy código
 * muerto; se conserva solo para no romper un import externo. Borrarla es una
 * decisión aparte.
 */
export function canPayByTransfer(tier: SubscriptionTier): boolean {
  return tier !== 'none'
}

// ---------------------------------------------------------------------------
// Desglose del pago
// ---------------------------------------------------------------------------

/** Desglose del monto que paga el alumno, según el método elegido. */
export interface PaymentBreakdown {
  /** Precio fijado por el profesor — SIEMPRE lo que recibe, íntegro. */
  base: number
  /** Comisión de servicio de DanzClass (0 con plan, y 0 en transferencia). */
  commission: number
  /** Porción del total que cubre el costo de procesamiento de MP (0 en transferencia). */
  mpFeeCovered: number
  /** Lo que efectivamente paga el alumno. */
  total: number
  /** Método de pago al que corresponde este desglose. */
  method: PaymentMethod
}

/**
 * Monto total a cobrar por Mercado Pago para que, después de que MP descuente
 * su comisión, queden exactamente `net` pesos repartibles (precio del profesor
 * + comisión de DanzClass).
 *
 * Hace falta un "gross-up" y no un simple recargo porcentual porque MP cobra
 * sobre el **monto total transado**, no sobre el precio base: sumar 3,7961%
 * plano haría que MP cobrara ese porcentaje sobre un monto ya inflado y el
 * profesor terminaría recibiendo menos que su precio.
 *
 * Exportada además para que el webhook pueda **reconstruir** el total esperado
 * a partir de lo persistido en `payments` (`amount` + `commission_amount`, que
 * no incluyen el gross-up) y compararlo con lo que MP dice que se pagó.
 */
export function grossUpForMp(net: number): number {
  return Math.round(net / (1 - MP_TOTAL_RATE))
}

/**
 * Desglosa lo que paga el alumno para un precio, un tier y un método de pago.
 *
 * - `'transfer'`: sin comisión ni gross-up. El alumno paga `base` y el profesor
 *   recibe `base`. Igual para todos los tiers.
 * - `'mp'`: el alumno paga `base` + comisión de DanzClass (solo sin plan) + el
 *   costo de procesamiento de MP, calculado con gross-up para que el profesor
 *   reciba `base` completo y DanzClass reciba `commission` vía marketplace_fee.
 *
 * Montos no positivos o inválidos devuelven un desglose en cero (el llamador
 * debe rechazar el pago; ver `create-payment` → `invalid_amount`).
 */
export function paymentBreakdown(
  amount: number,
  tier: SubscriptionTier,
  method: PaymentMethod
): PaymentBreakdown {
  const base = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0

  if (base === 0) return { base: 0, commission: 0, mpFeeCovered: 0, total: 0, method }
  if (method === 'transfer') return { base, commission: 0, mpFeeCovered: 0, total: base, method }

  const commission = paysCommission(tier) ? platformCommission(base) : 0
  const total = grossUpForMp(base + commission)
  return { base, commission, mpFeeCovered: total - base - commission, total, method }
}
