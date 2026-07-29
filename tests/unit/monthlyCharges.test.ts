import { test, expect } from '@playwright/test'
import {
  MONTHLY_CHARGE_GRACE_DAYS,
  billingPeriodOf,
  chargeDueDate,
  formatBillingPeriod,
  isChargeOverdue,
  paymentList,
  shiftBillingPeriod,
  summarizeCharges,
  todayInChile,
  type MonthlyCharge,
} from '../../packages/shared/src/lib/monthlyCharges'

function charge(period: string, status: MonthlyCharge['status'], amount = 30000): MonthlyCharge {
  return { id: `c-${period}-${status}`, billing_period: period, status, amount }
}

test.describe('todayInChile / billingPeriodOf', () => {
  test('emite YYYY-MM-DD', () => {
    expect(todayInChile(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07-15')
  })

  test('usa el huso de Chile, no UTC', () => {
    // 2026-07-15 02:00 UTC = 2026-07-14 22:00 en Chile (UTC-4 en invierno).
    expect(todayInChile(new Date('2026-07-15T02:00:00Z'))).toBe('2026-07-14')
  })

  test('el período es el mes en Chile', () => {
    // 1 de agosto 02:00 UTC sigue siendo 31 de julio en Chile → período de julio.
    expect(billingPeriodOf(new Date('2026-08-01T02:00:00Z'))).toBe('2026-07')
    expect(billingPeriodOf(new Date('2026-08-01T14:00:00Z'))).toBe('2026-08')
  })
})

test.describe('shiftBillingPeriod', () => {
  test('avanza y retrocede dentro del año', () => {
    expect(shiftBillingPeriod('2026-07', 1)).toBe('2026-08')
    expect(shiftBillingPeriod('2026-07', -1)).toBe('2026-06')
  })

  test('cruza el año en ambos sentidos', () => {
    expect(shiftBillingPeriod('2026-12', 1)).toBe('2027-01')
    expect(shiftBillingPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftBillingPeriod('2026-03', -14)).toBe('2025-01')
  })
})

test.describe('chargeDueDate', () => {
  test('día de cobro + gracia', () => {
    expect(chargeDueDate('2026-07', 5)).toBe(`2026-07-0${5 + MONTHLY_CHARGE_GRACE_DAYS}`)
    expect(chargeDueDate('2026-07', 10)).toBe('2026-07-13')
  })

  test('el tope 27 de billing_day impide desbordar el mes', () => {
    // 27 es el máximo que permite el CHECK de la migración 025: 27+3 = 30.
    expect(chargeDueDate('2026-02', 27)).toBe('2026-02-30')
    expect(chargeDueDate('2026-02', 27) < '2026-03-01').toBe(true)
  })

  test('valores fuera de rango se acotan en vez de romper', () => {
    expect(chargeDueDate('2026-07', 0)).toBe('2026-07-04')
    expect(chargeDueDate('2026-07', 99)).toBe('2026-07-30')
  })
})

test.describe('isChargeOverdue', () => {
  const billingDay = 5 // vence el 8

  test('no vence antes de la fecha de vencimiento', () => {
    expect(isChargeOverdue(charge('2026-07', 'due'), billingDay, '2026-07-08')).toBe(false)
    expect(isChargeOverdue(charge('2026-07', 'due'), billingDay, '2026-07-05')).toBe(false)
  })

  test('vence al día siguiente de la gracia', () => {
    expect(isChargeOverdue(charge('2026-07', 'due'), billingDay, '2026-07-09')).toBe(true)
  })

  test('un cargo rechazado vuelve a ser deuda', () => {
    expect(isChargeOverdue(charge('2026-07', 'rejected'), billingDay, '2026-09-01')).toBe(true)
  })

  test('un cargo reembolsado por Mercado Pago vuelve a ser deuda (P2-6)', () => {
    expect(isChargeOverdue(charge('2026-07', 'refunded'), billingDay, '2026-09-01')).toBe(true)
  })

  test('comprobante en revisión NUNCA vence (el retraso es del profesor)', () => {
    expect(isChargeOverdue(charge('2026-07', 'pending'), billingDay, '2027-01-01')).toBe(false)
  })

  test('pagado o anulado nunca vence', () => {
    expect(isChargeOverdue(charge('2026-07', 'verified'), billingDay, '2027-01-01')).toBe(false)
    expect(isChargeOverdue(charge('2026-07', 'void'), billingDay, '2027-01-01')).toBe(false)
  })
})

test.describe('summarizeCharges', () => {
  const billingDay = 5

  test('sin cargos no hay deuda', () => {
    const s = summarizeCharges([], billingDay, '2026-07-20')
    expect(s.totalUnpaid).toBe(0)
    expect(s.hasOverdue).toBe(false)
    expect(s.oldestUnpaid).toBeNull()
  })

  test('acumula meses impagos y devuelve el más antiguo primero', () => {
    const s = summarizeCharges(
      [charge('2026-07', 'due', 30000), charge('2026-05', 'due', 25000), charge('2026-06', 'rejected', 30000)],
      billingDay,
      '2026-07-20'
    )
    expect(s.charges.map((c) => c.billing_period)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(s.unpaid).toHaveLength(3)
    expect(s.totalUnpaid).toBe(85000)
    expect(s.oldestUnpaid?.billing_period).toBe('2026-05')
    expect(s.hasOverdue).toBe(true)
    expect(s.totalOverdue).toBe(85000)
  })

  test('un mes reembolsado se vuelve a cobrar y bloquea el QR', () => {
    // Un pago MP confirmado y después reembolsado: el mes deja de estar pagado.
    const s = summarizeCharges([charge('2026-06', 'refunded', 30000)], billingDay, '2026-07-20')
    expect(s.unpaid).toHaveLength(1)
    expect(s.paid).toHaveLength(0)
    expect(s.totalUnpaid).toBe(30000)
    expect(s.hasOverdue).toBe(true)
  })

  test('el mes en curso todavía en gracia no bloquea el QR, pero sí es deuda', () => {
    const s = summarizeCharges([charge('2026-07', 'due', 30000)], billingDay, '2026-07-06')
    expect(s.totalUnpaid).toBe(30000)
    expect(s.hasOverdue).toBe(false)
    expect(s.totalOverdue).toBe(0)
  })

  test('un comprobante en revisión no es deuda vencida pero se reporta aparte', () => {
    const s = summarizeCharges(
      [charge('2026-06', 'pending', 30000), charge('2026-07', 'due', 30000)],
      billingDay,
      '2026-07-06'
    )
    expect(s.totalInReview).toBe(30000)
    expect(s.totalUnpaid).toBe(30000)
    expect(s.hasOverdue).toBe(false)
  })

  test('los anulados se descartan por completo', () => {
    const s = summarizeCharges(
      [charge('2026-05', 'void', 30000), charge('2026-06', 'verified', 30000)],
      billingDay,
      '2026-07-20'
    )
    expect(s.charges.map((c) => c.billing_period)).toEqual(['2026-06'])
    expect(s.paid).toHaveLength(1)
    expect(s.totalUnpaid).toBe(0)
  })

  test('los pagos sin período (pago único) se ignoran', () => {
    const single = { id: 'p1', billing_period: '', status: 'pending' as const, amount: 12000 }
    const s = summarizeCharges([single, charge('2026-06', 'due')], billingDay, '2026-07-20')
    expect(s.charges).toHaveLength(1)
    expect(s.totalInReview).toBe(0)
  })
})

test.describe('formatBillingPeriod', () => {
  test('mes en español con inicial mayúscula', () => {
    expect(formatBillingPeriod('2026-07')).toBe('Julio 2026')
    expect(formatBillingPeriod('2026-12')).toBe('Diciembre 2026')
  })

  test('un período inválido se devuelve tal cual en vez de romper', () => {
    expect(formatBillingPeriod('basura')).toBe('basura')
  })
})

test.describe('paymentList', () => {
  test('normaliza objeto, array, null y undefined', () => {
    expect(paymentList({ id: 'a' })).toEqual([{ id: 'a' }])
    expect(paymentList([{ id: 'a' }, { id: 'b' }])).toHaveLength(2)
    expect(paymentList(null)).toEqual([])
    expect(paymentList(undefined)).toEqual([])
  })
})
