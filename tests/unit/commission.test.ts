/**
 * Unit tests for packages/shared/src/lib/commission.ts — comisión de plataforma
 * para pagos in-app de alumnos sin plan.
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
} from '../../packages/shared/src/lib/commission'

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

test.describe('paysCommission / canPayByTransfer', () => {
  test('only planless students pay commission', () => {
    expect(paysCommission('none')).toBe(true)
    expect(paysCommission('basic')).toBe(false)
    expect(paysCommission('pro')).toBe(false)
  })

  test('direct transfer is reserved for students with a plan', () => {
    expect(canPayByTransfer('none')).toBe(false)
    expect(canPayByTransfer('basic')).toBe(true)
    expect(canPayByTransfer('pro')).toBe(true)
  })
})

test.describe('paymentBreakdown', () => {
  test('adds commission on top for planless (teacher gets full price)', () => {
    expect(paymentBreakdown(10000, 'none')).toEqual({ base: 10000, commission: 200, total: 10200 })
  })

  test('no commission for students with a plan', () => {
    expect(paymentBreakdown(10000, 'basic')).toEqual({ base: 10000, commission: 0, total: 10000 })
  })

  test('respects the cap in the total', () => {
    expect(paymentBreakdown(100000, 'none')).toEqual({ base: 100000, commission: 700, total: 100700 })
  })
})
