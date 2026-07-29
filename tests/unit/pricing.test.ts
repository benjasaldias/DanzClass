/**
 * Unit tests for packages/shared/src/lib/pricing.ts — precio efectivo de una
 * clase (con descuento espontáneo activo). Regresión: PaymentClient (web+mobile)
 * y create-payment (MP) cobraban siempre el precio base, ignorando el descuento.
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import { isPeriodicClass, effectiveClassPrice, twoxClassPrice } from '../../packages/shared/src/lib/pricing'

test.describe('isPeriodicClass', () => {
  test('periodica and entrenamiento are periodic', () => {
    expect(isPeriodicClass('periodica')).toBe(true)
    expect(isPeriodicClass('entrenamiento')).toBe(true)
  })

  test('suelta is not periodic', () => {
    expect(isPeriodicClass('suelta')).toBe(false)
  })
})

test.describe('effectiveClassPrice', () => {
  test('suelta with an active discount charges the discount price', () => {
    expect(effectiveClassPrice({ type: 'suelta', price: 10000, discount_price: 7000 })).toBe(7000)
  })

  test('suelta without a discount charges the base price', () => {
    expect(effectiveClassPrice({ type: 'suelta', price: 10000, discount_price: null })).toBe(10000)
  })

  test('periodica with an active monthly discount charges the discount price', () => {
    expect(effectiveClassPrice({ type: 'periodica', price: 30000, discount_price_monthly: 20000 })).toBe(20000)
  })

  test('periodica ignores discount_price (only discount_price_monthly applies)', () => {
    expect(effectiveClassPrice({ type: 'periodica', price: 30000, discount_price: 5000, discount_price_monthly: null })).toBe(30000)
  })

  test('entrenamiento with an active monthly discount charges the discount price', () => {
    expect(effectiveClassPrice({ type: 'entrenamiento', price: 40000, discount_price_monthly: 35000 })).toBe(35000)
  })

  test('missing discount fields fall back to base price', () => {
    expect(effectiveClassPrice({ type: 'suelta', price: 10000 })).toBe(10000)
  })
})

test.describe('twoxClassPrice', () => {
  test('prefers price_2x when both are set', () => {
    expect(twoxClassPrice({ price_2x: 8000, price_suelta_2x: 6000 })).toBe(8000)
  })

  test('falls back to price_suelta_2x (2x de una sesión suelta en clase periódica)', () => {
    expect(twoxClassPrice({ price_2x: null, price_suelta_2x: 6000 })).toBe(6000)
  })

  test('returns null when the teacher configured no 2x price', () => {
    expect(twoxClassPrice({ price_2x: null, price_suelta_2x: null })).toBe(null)
    expect(twoxClassPrice({})).toBe(null)
  })
})
