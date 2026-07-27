import { test, expect } from '@playwright/test'
import { resolveClassStartDate } from '../../packages/shared/src/lib/classSchedule'

// 2026-08-03 es LUNES (getDay() === 1).
const MONDAY = '2026-08-03'

test.describe('resolveClassStartDate', () => {
  test('custom: usa la primera fecha marcada, sin importar el orden', () => {
    expect(
      resolveClassStartDate({
        recurrence: 'custom',
        customDates: ['2026-09-10', '2026-08-15', '2026-10-01'],
      })
    ).toBe('2026-08-15')
  })

  test('custom sin fechas: null', () => {
    expect(resolveClassStartDate({ recurrence: 'custom', customDates: [] })).toBe(null)
  })

  test('weekly: la fecha elegida ya cae en el día correcto → se respeta', () => {
    // Lunes elegido, clase los lunes (dayOfWeek 1).
    expect(
      resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: 1, startDate: MONDAY })
    ).toBe(MONDAY)
  })

  test('weekly: la fecha elegida NO cae en el día → avanza al siguiente', () => {
    // Lunes elegido, clase los jueves (dayOfWeek 4) → jueves 2026-08-06.
    expect(
      resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: 4, startDate: MONDAY })
    ).toBe('2026-08-06')
  })

  test('weekly: avanzar cruza el fin de semana correctamente', () => {
    // Lunes elegido, clase los domingos (dayOfWeek 0) → domingo 2026-08-09.
    expect(
      resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: 0, startDate: MONDAY })
    ).toBe('2026-08-09')
  })

  test('sin fecha elegida: próxima ocurrencia desde hoy (comportamiento previo)', () => {
    // "Hoy" lunes, clase los miércoles (3) → miércoles 2026-08-05.
    expect(
      resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: 3, today: MONDAY })
    ).toBe('2026-08-05')
  })

  test('biweekly usa la misma regla que weekly (la fase la define el ancla)', () => {
    expect(
      resolveClassStartDate({ recurrence: 'biweekly', dayOfWeek: 5, startDate: MONDAY })
    ).toBe('2026-08-07')
  })

  test('monthly: respeta la fecha elegida (define el día del mes)', () => {
    expect(
      resolveClassStartDate({ recurrence: 'monthly', dayOfWeek: 4, startDate: '2026-08-20' })
    ).toBe('2026-08-20')
  })

  test('sin día de la semana no hay ancla posible', () => {
    expect(resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: null, startDate: MONDAY })).toBe(null)
  })

  test('no muta la fecha de entrada ni sufre el off-by-one de UTC', () => {
    const startDate = '2026-08-03'
    resolveClassStartDate({ recurrence: 'weekly', dayOfWeek: 6, startDate })
    expect(startDate).toBe('2026-08-03')
  })
})
