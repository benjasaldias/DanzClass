import { test, expect } from '@playwright/test'
import {
  resolveClassStartDate,
  datesWithinOneCalendarMonth,
  validatePeriodicaDates,
  lastCustomDate,
  lastSessionEnd,
  getClassDeletionDate,
  getClassSessions,
} from '../../packages/shared/src/lib/classSchedule'

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

// ─────────────────────────────────────────────────────────────────────────────
// Regla de "un solo mes calendario" para clases periódicas (sesión S3 del audit)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('datesWithinOneCalendarMonth', () => {
  test('todas en el mismo mes → true', () => {
    expect(datesWithinOneCalendarMonth(['2026-08-05', '2026-08-12', '2026-08-26'])).toBe(true)
  })

  test('cruzando de mes → false, aunque sean pocos días', () => {
    expect(datesWithinOneCalendarMonth(['2026-08-31', '2026-09-01'])).toBe(false)
  })

  test('mismo mes de años distintos → false', () => {
    expect(datesWithinOneCalendarMonth(['2026-08-10', '2027-08-10'])).toBe(false)
  })

  test('0 o 1 fecha siempre es válido', () => {
    expect(datesWithinOneCalendarMonth([])).toBe(true)
    expect(datesWithinOneCalendarMonth(['2026-08-05'])).toBe(true)
  })

  test('no depende del orden en que vengan las fechas', () => {
    expect(datesWithinOneCalendarMonth(['2026-09-02', '2026-08-31'])).toBe(false)
    expect(datesWithinOneCalendarMonth(['2026-08-26', '2026-08-05'])).toBe(true)
  })
})

test.describe('validatePeriodicaDates', () => {
  test('sin fechas → pide al menos una', () => {
    expect(validatePeriodicaDates([])).toMatch(/al menos una fecha/)
  })

  test('fecha con formato inválido → la nombra', () => {
    expect(validatePeriodicaDates(['2026-08-05', '05/08/2026'])).toMatch(/05\/08\/2026/)
  })

  test('fecha inexistente (31 de febrero) → inválida', () => {
    expect(validatePeriodicaDates(['2026-02-31'])).toMatch(/Fecha inválida/)
  })

  test('fechas válidas dentro de un mes → sin error', () => {
    expect(validatePeriodicaDates(['2026-08-05', '2026-08-12'])).toBe(null)
  })

  test('fechas que cruzan de mes → bloquea', () => {
    expect(validatePeriodicaDates(['2026-08-26', '2026-09-02'])).toMatch(/un mismo mes/)
  })

  test('allowMultiMonth deja pasar el cruce de mes (entrenamiento y clases heredadas)', () => {
    expect(validatePeriodicaDates(['2026-08-26', '2026-09-02'], { allowMultiMonth: true })).toBe(null)
  })

  test('allowMultiMonth NO deja pasar una fecha inválida', () => {
    expect(validatePeriodicaDates(['no-es-fecha'], { allowMultiMonth: true })).toMatch(/Fecha inválida/)
  })
})

test.describe('lastCustomDate', () => {
  test('devuelve la mayor sin importar el orden', () => {
    expect(lastCustomDate(['2026-08-26', '2026-08-05', '2026-08-12'])).toBe('2026-08-26')
  })

  test('null/vacío → null', () => {
    expect(lastCustomDate([])).toBe(null)
    expect(lastCustomDate(null)).toBe(null)
    expect(lastCustomDate(undefined)).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// lastSessionEnd / getClassDeletionDate — consolidados desde el cron y
// my-classes/page.tsx (D-5). Antes vivían duplicados y sin ninguna prueba.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('lastSessionEnd', () => {
  test('suelta: fecha + hora + duración', () => {
    const end = lastSessionEnd({ type: 'suelta', date: '2026-08-05', time: '19:00', duration_minutes: 90 })
    expect(end).toEqual(new Date(2026, 7, 5, 20, 30))
  })

  test('custom: usa la ÚLTIMA fecha del calendario, no la primera ni el orden del array', () => {
    const end = lastSessionEnd({
      type: 'periodica',
      recurrence: 'custom',
      custom_dates: ['2026-08-26', '2026-08-05', '2026-08-12'],
      recurring_time: '20:00',
      duration_minutes: 60,
    })
    expect(end).toEqual(new Date(2026, 7, 26, 21, 0))
  })

  test('custom sin fechas → null', () => {
    expect(lastSessionEnd({ type: 'periodica', recurrence: 'custom', custom_dates: [] })).toBe(null)
  })

  test('entrenamiento weekly: usa ends_at', () => {
    const end = lastSessionEnd({
      type: 'entrenamiento', recurrence: 'weekly',
      ends_at: '2026-09-30', recurring_time: '18:00', duration_minutes: 120,
    })
    expect(end).toEqual(new Date(2026, 8, 30, 20, 0))
  })

  test('entrenamiento indefinido → null (nunca se archiva)', () => {
    expect(lastSessionEnd({
      type: 'entrenamiento', recurrence: 'weekly',
      ends_indefinitely: true, ends_at: '2026-09-30', recurring_time: '18:00',
    })).toBe(null)
  })

  test('sin duración asume 60 minutos', () => {
    const end = lastSessionEnd({ type: 'suelta', date: '2026-08-05', time: '19:00' })
    expect(end).toEqual(new Date(2026, 7, 5, 20, 0))
  })
})

test.describe('getClassDeletionDate', () => {
  test('24 h después del fin de la última sesión', () => {
    const del = getClassDeletionDate({ type: 'suelta', date: '2026-08-05', time: '19:00', duration_minutes: 60 })
    expect(del).toEqual(new Date(2026, 7, 6, 20, 0))
  })

  test('clase sin fin determinable → null', () => {
    expect(getClassDeletionDate({ type: 'entrenamiento', recurrence: 'weekly', ends_indefinitely: true })).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getClassSessions — la copia de mobile calculaba mal las mensuales
// ─────────────────────────────────────────────────────────────────────────────

test.describe('getClassSessions — monthly con día 29-31', () => {
  test('el 31 de enero no desborda a marzo: se recorta al último día de cada mes', () => {
    const sessions = getClassSessions(
      { type: 'entrenamiento', recurrence: 'monthly', start_date: '2027-01-31', ends_at: '2027-04-30' },
      new Date(2027, 0, 1),
      new Date(2027, 4, 31),
    )
    expect(sessions).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  })
})
