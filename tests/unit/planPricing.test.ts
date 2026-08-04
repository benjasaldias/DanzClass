/**
 * Unit tests del precio de los planes de suscripción:
 *   - `SUBSCRIPTION_PLANS` (packages/shared/src/types/index.ts) — fuente única
 *     del precio mensual y de lo que se le promete al usuario.
 *   - `paidPlanConfig` — lo que leen las dos rutas de Mercado Pago.
 *   - `annualPlanPrice` / `annualPlanSavings` (lib/pricing.ts) — el pago único
 *     anual con su descuento.
 *
 * Por qué existen estos tests: hasta la sesión 2026-08-02 el precio vivía en
 * TRES copias (display + `create-subscription` + `create-preference`), y la UI
 * anunciaba un ahorro anual que no existía. Un desajuste entre lo que se
 * anuncia y lo que se cobra no es un bug cosmético: es publicidad engañosa bajo
 * la Ley 19.496 (SERNAC), que los propios /terms citan.
 *
 * Run with: npm run test:unit
 */

import { test, expect } from '@playwright/test'
import {
  SUBSCRIPTION_PLANS,
  paidPlanConfig,
  annualPlanPrice,
  annualPlanSavings,
  ANNUAL_DISCOUNT_RATE,
} from '../../packages/shared/src/index'

test.describe('SUBSCRIPTION_PLANS — precios vigentes', () => {
  test('Básico $2.000 y Pro $8.000, en CLP', () => {
    const basic = SUBSCRIPTION_PLANS.find((p) => p.tier === 'basic')!
    const pro = SUBSCRIPTION_PLANS.find((p) => p.tier === 'pro')!
    expect(basic.price).toBe(2000)
    expect(pro.price).toBe(8000)
  })

  test('sólo existen los dos planes pagos', () => {
    expect(SUBSCRIPTION_PLANS.map((p) => p.tier)).toEqual(['basic', 'pro'])
  })

  test('todo plan tiene al menos una viñeta y ninguna vacía', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.features.length).toBeGreaterThan(0)
      for (const f of plan.features) expect(f.trim().length).toBeGreaterThan(0)
    }
  })
})

test.describe('paidPlanConfig — lo que leen las rutas de Mercado Pago', () => {
  test('devuelve el MISMO precio que se muestra en la UI', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(paidPlanConfig(plan.tier)!.price).toBe(plan.price)
    }
  })

  test('el nombre que ve el usuario en el checkout lleva la marca', () => {
    expect(paidPlanConfig('basic')!.name).toBe('DanzClass Básico')
    expect(paidPlanConfig('pro')!.name).toBe('DanzClass Pro')
  })

  test('un tier que no es un plan pago devuelve null, no un default', () => {
    // El llamador debe responder 400. Un default silencioso cobraría el precio
    // de otro plan.
    expect(paidPlanConfig('none')).toBeNull()
    expect(paidPlanConfig('teacher')).toBeNull()
    expect(paidPlanConfig('')).toBeNull()
    expect(paidPlanConfig('PRO')).toBeNull()
  })
})

test.describe('annualPlanPrice — pago único anual con 10% de descuento', () => {
  test('el descuento configurado es 10%', () => {
    expect(ANNUAL_DISCOUNT_RATE).toBe(0.1)
  })

  test('Básico: 12 × $2.000 − 10% = $21.600', () => {
    expect(annualPlanPrice(2000)).toBe(21600)
  })

  test('Pro: 12 × $8.000 − 10% = $86.400', () => {
    expect(annualPlanPrice(8000)).toBe(86400)
  })

  test('siempre es más barato que 12 meses sueltos', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(annualPlanPrice(plan.price)).toBeLessThan(plan.price * 12)
    }
  })

  test('devuelve un entero — CLP no tiene decimales', () => {
    for (const monthly of [1500, 2000, 3333, 8000, 12345]) {
      expect(Number.isInteger(annualPlanPrice(monthly))).toBe(true)
    }
  })

  test('montos inválidos devuelven 0, no NaN', () => {
    expect(annualPlanPrice(0)).toBe(0)
    expect(annualPlanPrice(-100)).toBe(0)
    expect(annualPlanPrice(NaN)).toBe(0)
    expect(annualPlanPrice(Infinity)).toBe(0)
  })
})

test.describe('annualPlanSavings — el ahorro anunciado debe ser el ahorro real', () => {
  test('es exactamente la diferencia con 12 pagos mensuales', () => {
    // Ésta es la invariante que faltaba: mobile anunciaba "ahorras $3.000"
    // cuando el anual cobraba 12 meses exactos, sin descuento alguno.
    for (const monthly of [2000, 8000, 1500, 3333]) {
      expect(annualPlanSavings(monthly)).toBe(monthly * 12 - annualPlanPrice(monthly))
    }
  })

  test('Básico ahorra $2.400 y Pro $9.600', () => {
    expect(annualPlanSavings(2000)).toBe(2400)
    expect(annualPlanSavings(8000)).toBe(9600)
  })

  test('el ahorro es siempre positivo para los planes reales', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(annualPlanSavings(plan.price)).toBeGreaterThan(0)
    }
  })

  test('montos inválidos devuelven 0', () => {
    expect(annualPlanSavings(0)).toBe(0)
    expect(annualPlanSavings(-1)).toBe(0)
    expect(annualPlanSavings(NaN)).toBe(0)
  })
})
