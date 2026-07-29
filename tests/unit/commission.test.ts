/**
 * Unit tests for packages/shared/src/lib/commission.ts — comisión de servicio
 * de DanzClass + gross-up del costo de procesamiento de Mercado Pago.
 *
 * Invariante central del modelo (marketplace payments v2): el profesor recibe
 * SIEMPRE el 100% del precio que fijó, cualquiera sea el método y el plan del
 * alumno. Todo lo que se cobra por encima de `base` es comisión de DanzClass
 * (solo MP + sin plan) o costo de procesamiento de MP (solo MP).
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import {
  platformCommission,
  paysCommission,
  canPayByTransfer,
  paymentBreakdown,
  COMMISSION_CAP_CLP,
  MP_FEE_RATE,
  MP_FEE_IVA_RATE,
  MP_TOTAL_RATE,
  grossUpForMp,
} from '../../packages/shared/src/lib/commission'
import type { SubscriptionTier } from '../../packages/shared/src/types/index'

test.describe('platformCommission', () => {
  test('is 2% of the amount below the cap', () => {
    expect(platformCommission(10000)).toBe(200)
    expect(platformCommission(5000)).toBe(100)
  })

  test('rounds to whole pesos', () => {
    expect(platformCommission(1234)).toBe(25) // 24.68 → 25
  })

  test('caps at $700', () => {
    expect(platformCommission(35000)).toBe(700) // exactly at cap
    expect(platformCommission(100000)).toBe(700) // above cap → flat 700
    expect(platformCommission(999999)).toBe(COMMISSION_CAP_CLP)
  })

  test('is 0 for non-positive or invalid amounts', () => {
    expect(platformCommission(0)).toBe(0)
    expect(platformCommission(-5000)).toBe(0)
    expect(platformCommission(NaN)).toBe(0)
  })
})

test.describe('MP rates', () => {
  test('total rate is the Checkout Pro fee plus its IVA (3.7961%)', () => {
    expect(MP_FEE_RATE).toBe(0.0319)
    expect(MP_FEE_IVA_RATE).toBeCloseTo(0.006061, 10)
    expect(MP_TOTAL_RATE).toBeCloseTo(0.037961, 10)
  })
})

test.describe('paysCommission / canPayByTransfer', () => {
  test('only planless students pay the DanzClass service commission', () => {
    expect(paysCommission('none')).toBe(true)
    expect(paysCommission('basic')).toBe(false)
    expect(paysCommission('teacher')).toBe(false)
    expect(paysCommission('pro')).toBe(false)
  })

  // Deprecada para clases individuales (ahora manda classes.accepts_transfer),
  // pero sigue gateando paquetes de clases — no debe cambiar de comportamiento.
  test('canPayByTransfer still reflects "has a plan" (used by class packages)', () => {
    expect(canPayByTransfer('none')).toBe(false)
    expect(canPayByTransfer('basic')).toBe(true)
    expect(canPayByTransfer('pro')).toBe(true)
  })
})

test.describe('paymentBreakdown — transfer', () => {
  test('student pays exactly the price, with or without a plan', () => {
    expect(paymentBreakdown(15000, 'none', 'transfer')).toEqual({
      base: 15000, commission: 0, mpFeeCovered: 0, total: 15000, method: 'transfer',
    })
    expect(paymentBreakdown(15000, 'pro', 'transfer')).toEqual({
      base: 15000, commission: 0, mpFeeCovered: 0, total: 15000, method: 'transfer',
    })
  })

  test('never charges a commission, not even above the cap', () => {
    const b = paymentBreakdown(500000, 'none', 'transfer')
    expect(b.commission).toBe(0)
    expect(b.total).toBe(b.base)
  })
})

test.describe('paymentBreakdown — mp, planless student', () => {
  // Tabla de marketplace-payments-v2-plan.md §1.3
  const cases: Array<{ price: number; commission: number; total: number }> = [
    { price: 15000, commission: 300, total: 15904 },
    { price: 25000, commission: 500, total: 26506 },
    { price: 35000, commission: 700, total: 37109 }, // tope alcanzado justo aquí
    { price: 50000, commission: 700, total: 52701 }, // tope ya diluyéndose
  ]

  for (const { price, commission, total } of cases) {
    test(`price ${price} → commission ${commission}, total ${total}`, () => {
      const b = paymentBreakdown(price, 'none', 'mp')
      expect(b.base).toBe(price)
      expect(b.commission).toBe(commission)
      expect(b.total).toBe(total)
      expect(b.mpFeeCovered).toBe(total - price - commission)
      expect(b.method).toBe('mp')
    })
  }

  test('after MP takes its cut, teacher + DanzClass are made whole (±1 peso de redondeo)', () => {
    for (const price of [3000, 12345, 15000, 35000, 50000, 199999]) {
      const b = paymentBreakdown(price, 'none', 'mp')
      const leftAfterMp = b.total - b.total * MP_TOTAL_RATE
      expect(Math.abs(leftAfterMp - (b.base + b.commission))).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('paymentBreakdown — mp, student with a plan', () => {
  const cases: Array<{ price: number; total: number }> = [
    { price: 15000, total: 15592 },
    { price: 25000, total: 25986 },
    { price: 35000, total: 36381 },
    { price: 50000, total: 51973 },
  ]

  for (const { price, total } of cases) {
    test(`price ${price} → no commission, total ${total}`, () => {
      const b = paymentBreakdown(price, 'basic', 'mp')
      expect(b.base).toBe(price)
      expect(b.commission).toBe(0)
      expect(b.total).toBe(total)
      expect(b.mpFeeCovered).toBe(total - price)
    })
  }

  test('the plan-holder surcharge is only the MP gross-up (~3.95%, constant)', () => {
    for (const price of [10000, 25000, 80000]) {
      const b = paymentBreakdown(price, 'pro', 'mp')
      expect((b.total - b.base) / b.base).toBeCloseTo(MP_TOTAL_RATE / (1 - MP_TOTAL_RATE), 4)
    }
  })

  test('a plan always costs the student less by MP than no plan', () => {
    for (const price of [5000, 15000, 35000, 90000]) {
      expect(paymentBreakdown(price, 'basic', 'mp').total)
        .toBeLessThan(paymentBreakdown(price, 'none', 'mp').total)
    }
  })
})

test.describe('paymentBreakdown — invariants and edge cases', () => {
  test('the teacher never absorbs anything: base is the price in every combination', () => {
    for (const tier of ['none', 'basic', 'teacher', 'pro'] as const) {
      for (const method of ['mp', 'transfer'] as const) {
        expect(paymentBreakdown(20000, tier, method).base).toBe(20000)
      }
    }
  })

  test('transfer is never more expensive than MP for the same student', () => {
    for (const tier of ['none', 'pro'] as const) {
      expect(paymentBreakdown(18000, tier, 'transfer').total)
        .toBeLessThanOrEqual(paymentBreakdown(18000, tier, 'mp').total)
    }
  })

  test('rounds the price to whole pesos', () => {
    expect(paymentBreakdown(10000.4, 'pro', 'transfer').base).toBe(10000)
    expect(paymentBreakdown(10000.6, 'pro', 'transfer').base).toBe(10001)
  })

  test('non-positive or invalid prices collapse to a zero breakdown', () => {
    for (const bad of [0, -1000, NaN, Infinity]) {
      for (const method of ['mp', 'transfer'] as const) {
        expect(paymentBreakdown(bad, 'none', method)).toEqual({
          base: 0, commission: 0, mpFeeCovered: 0, total: 0, method,
        })
      }
    }
  })
})

// El webhook de MP NO recibe el total en `payments` (ahí se guarda el reparto:
// amount = precio del profesor, commission_amount = comisión DanzClass). Para
// validar el monto aprobado tiene que reconstruir el total con grossUpForMp.
// Si estas dos vías divergieran, TODO pago MP quedaría marcado como mismatch y
// nunca se auto-confirmaría.
test.describe('grossUpForMp — el webhook reconstruye el total cobrado', () => {
  const tiers: SubscriptionTier[] = ['none', 'basic', 'pro']
  for (const tier of tiers) {
    for (const price of [3000, 15000, 25000, 35000, 50000, 123457]) {
      test(`price ${price}, tier ${tier}: grossUpForMp(base + commission) === total`, () => {
        const b = paymentBreakdown(price, tier, 'mp')
        expect(grossUpForMp(b.base + b.commission)).toBe(b.total)
      })
    }
  }
})
