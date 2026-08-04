import { test, expect } from '@playwright/test'
import {
  rehearsalExpiresAt,
  isRehearsalExpired,
  isCoordinationSettled,
  daysUntilRehearsalExpiry,
  rehearsalNotExpiredFilter,
  formatRehearsalWhen,
  timeToMinutes,
  minutesToTime,
  hoursTouchedByRange,
  rangeDurationMinutes,
  formatRange,
  tallyProposal,
  isProposalStale,
  REHEARSAL_GRACE_HOURS,
} from '../../packages/shared/src/lib/rehearsalSchedule'
import { buildDiscardIndex } from '../../packages/shared/src/lib/rehearsalDiscards'

// ─────────────────────────── Caducidad ───────────────────────────

test.describe('rehearsalExpiresAt — caso 1: fecha fija', () => {
  test('caduca 2 h después de que TERMINA, no de que empieza', () => {
    const exp = rehearsalExpiresAt({
      date_mode: 'single',
      rehearsal_date: '2026-08-14',
      rehearsal_time: '19:00',
      duration_minutes: 90,
    })
    // 19:00 + 90 min = 20:30 → + 2 h = 22:30 local
    expect(exp).toEqual(new Date(2026, 7, 14, 22, 30, 0, 0))
  })

  test('sin hora arranca a medianoche', () => {
    const exp = rehearsalExpiresAt({
      date_mode: 'single',
      rehearsal_date: '2026-08-14',
      rehearsal_time: null,
      duration_minutes: 60,
    })
    expect(exp).toEqual(new Date(2026, 7, 14, 3, 0, 0, 0))
  })

  test('la fecha manda sobre el modo: un coordinate ya fijado usa el caso 1', () => {
    const exp = rehearsalExpiresAt({
      date_mode: 'coordinate',
      coordinate_month: '2026-08',
      rehearsal_date: '2026-08-14',
      rehearsal_time: '12:30',
      duration_minutes: 65, // 12:30 → 13:35
    })
    // Termina 13:35 → caduca 15:35. NO al final del mes.
    expect(exp).toEqual(new Date(2026, 7, 14, 15, 35, 0, 0))
  })

  test('no usa new Date(str) — no hay off-by-one de zona horaria', () => {
    // `new Date('2026-08-14')` es medianoche UTC, que en Chile cae el 13.
    const exp = rehearsalExpiresAt({
      date_mode: 'single',
      rehearsal_date: '2026-08-14',
      rehearsal_time: '00:00',
      duration_minutes: 0,
    })
    expect(exp!.getDate()).toBe(14)
  })
})

test.describe('rehearsalExpiresAt — caso 1b: varias fechas', () => {
  test('toma la ÚLTIMA fecha, no la primera ni el orden del array', () => {
    const exp = rehearsalExpiresAt({
      date_mode: 'custom',
      custom_dates: ['2026-08-20', '2026-08-05', '2026-08-12'],
    })
    // Fin del 20 = medianoche del 21, + 2 h.
    expect(exp).toEqual(new Date(2026, 7, 21, REHEARSAL_GRACE_HOURS, 0, 0, 0))
  })

  test('una fecha con formato inválido no rompe el cálculo', () => {
    const exp = rehearsalExpiresAt({
      date_mode: 'custom',
      custom_dates: ['2026-08-05', 'no-es-fecha'],
    })
    expect(exp).toEqual(new Date(2026, 7, 6, REHEARSAL_GRACE_HOURS, 0, 0, 0))
  })

  test('sin ninguna fecha válida → no caduca', () => {
    expect(rehearsalExpiresAt({ date_mode: 'custom', custom_dates: ['basura'] })).toBe(null)
    expect(rehearsalExpiresAt({ date_mode: 'custom', custom_dates: [] })).toBe(null)
  })
})

test.describe('rehearsalExpiresAt — caso 2: coordinando sin fecha', () => {
  test('caduca al empezar el mes siguiente, sin gracia', () => {
    const exp = rehearsalExpiresAt({ date_mode: 'coordinate', coordinate_month: '2026-08' })
    expect(exp).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
  })

  test('diciembre rueda a enero del año siguiente', () => {
    const exp = rehearsalExpiresAt({ date_mode: 'coordinate', coordinate_month: '2026-12' })
    expect(exp).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0))
  })

  test('mes con formato inválido → no caduca (no se borra a ciegas)', () => {
    expect(rehearsalExpiresAt({ date_mode: 'coordinate', coordinate_month: '2026-8' })).toBe(null)
    expect(rehearsalExpiresAt({ date_mode: 'coordinate', coordinate_month: null })).toBe(null)
  })
})

test.describe('rehearsalExpiresAt — caso 4: datos insuficientes', () => {
  test('un single sin fecha (hoy posible: el modal no la exige) NO caduca', () => {
    expect(rehearsalExpiresAt({ date_mode: 'single', rehearsal_date: null })).toBe(null)
  })
})

test.describe('isRehearsalExpired', () => {
  const r = { date_mode: 'single', rehearsal_date: '2026-08-14', rehearsal_time: '19:00', duration_minutes: 60 }

  test('sigue vivo mientras ocurre y durante la gracia', () => {
    expect(isRehearsalExpired(r, new Date(2026, 7, 14, 19, 30))).toBe(false)
    expect(isRehearsalExpired(r, new Date(2026, 7, 14, 21, 59))).toBe(false)
  })

  test('caduca exactamente al cumplirse la gracia', () => {
    // Termina 20:00 → caduca 22:00
    expect(isRehearsalExpired(r, new Date(2026, 7, 14, 22, 0))).toBe(true)
  })

  test('lo que no caduca nunca se da por caducado', () => {
    expect(isRehearsalExpired({ date_mode: 'single' }, new Date(2099, 0, 1))).toBe(false)
  })
})

test.describe('rehearsalNotExpiredFilter', () => {
  test('deja pasar los NULL primero: no caduca ≠ caducado', () => {
    const f = rehearsalNotExpiredFilter(new Date('2026-08-14T12:00:00.000Z'))
    expect(f).toBe('expires_at.is.null,expires_at.gte.2026-08-14T12:00:00.000Z')
  })
})

test.describe('daysUntilRehearsalExpiry / isCoordinationSettled', () => {
  test('cuenta los días que faltan', () => {
    const d = daysUntilRehearsalExpiry(
      { date_mode: 'coordinate', coordinate_month: '2026-08' },
      new Date(2026, 7, 25, 12, 0),
    )
    expect(d).toBe(7)
  })

  test('un coordinate con fecha ya está resuelto; sin fecha, no', () => {
    expect(isCoordinationSettled({ date_mode: 'coordinate', rehearsal_date: '2026-08-14' })).toBe(true)
    expect(isCoordinationSettled({ date_mode: 'coordinate', coordinate_month: '2026-08' })).toBe(false)
    // Un `single` no es una coordinación resuelta: nunca hubo coordinación.
    expect(isCoordinationSettled({ date_mode: 'single', rehearsal_date: '2026-08-14' })).toBe(false)
  })
})

// ─────────────────────────── Display ───────────────────────────

test.describe('formatRehearsalWhen', () => {
  test('un coordinate ya fijado NO dice "Coordinando" — el bug de las 5 pantallas', () => {
    expect(formatRehearsalWhen({
      date_mode: 'coordinate',
      coordinate_month: '2026-08',
      rehearsal_date: '2026-08-14',
    })).toBe('14 de Agosto 2026 (fecha fijada)')
  })

  test('coordinate sin fecha sigue diciendo el mes', () => {
    expect(formatRehearsalWhen({ date_mode: 'coordinate', coordinate_month: '2026-08' }))
      .toBe('Coordinando para Agosto 2026')
  })

  test('single, una fecha custom y varias', () => {
    expect(formatRehearsalWhen({ date_mode: 'single', rehearsal_date: '2026-08-14' })).toBe('14 de Agosto 2026')
    expect(formatRehearsalWhen({ date_mode: 'custom', custom_dates: ['2026-08-14'] })).toBe('14 de Agosto 2026')
    expect(formatRehearsalWhen({ date_mode: 'custom', custom_dates: ['2026-08-14', '2026-08-20'] }))
      .toBe('2 fechas seleccionadas')
  })

  test('sin datos, un texto neutro en vez de "Invalid Date"', () => {
    expect(formatRehearsalWhen({ date_mode: 'coordinate' })).toBe('Fecha por coordinar')
  })
})

// ─────────────────────────── Rangos horarios ───────────────────────────

test.describe('timeToMinutes / minutesToTime', () => {
  test('ida y vuelta con minutos no redondos', () => {
    expect(timeToMinutes('12:30')).toBe(750)
    expect(timeToMinutes('13:35')).toBe(815)
    expect(minutesToTime(815)).toBe('13:35')
  })

  test('tolera HH:MM:SS (lo que devuelve un TIME de Postgres)', () => {
    expect(timeToMinutes('12:30:00')).toBe(750)
  })

  test('rechaza basura y horas fuera de rango', () => {
    expect(timeToMinutes('25:00')).toBe(null)
    expect(timeToMinutes('12:60')).toBe(null)
    expect(timeToMinutes('')).toBe(null)
    expect(timeToMinutes(null)).toBe(null)
  })
})

test.describe('hoursTouchedByRange', () => {
  test('12:30–13:35 ocupa las horas 12 y 13', () => {
    expect(hoursTouchedByRange({ start_time: '12:30', end_time: '13:35' })).toEqual([12, 13])
  })

  test('un rango que termina en la hora en punto no ocupa esa hora', () => {
    expect(hoursTouchedByRange({ start_time: '12:00', end_time: '13:00' })).toEqual([12])
  })

  test('un rango largo cubre todos los bloques intermedios', () => {
    expect(hoursTouchedByRange({ start_time: '10:15', end_time: '13:05' })).toEqual([10, 11, 12, 13])
  })

  test('rango vacío o invertido no ocupa nada', () => {
    expect(hoursTouchedByRange({ start_time: '13:00', end_time: '12:00' })).toEqual([])
    expect(hoursTouchedByRange({ start_time: '12:00', end_time: '12:00' })).toEqual([])
  })
})

test.describe('rangeDurationMinutes / formatRange', () => {
  test('la duración sale del rango, con minutos exactos', () => {
    expect(rangeDurationMinutes({ start_time: '12:30', end_time: '13:35' })).toBe(65)
  })

  test('el texto muestra horas y minutos', () => {
    expect(formatRange({ start_time: '12:30', end_time: '13:35' })).toBe('12:30 a 13:35 (1 h 5 min)')
    expect(formatRange({ start_time: '12:00', end_time: '14:00' })).toBe('12:00 a 14:00 (2 h)')
    expect(formatRange({ start_time: '12:00', end_time: '12:45' })).toBe('12:00 a 12:45 (45 min)')
  })
})

// ─────────────────────────── Votación ───────────────────────────

test.describe('tallyProposal', () => {
  test('el creador cuenta como confirmado sin votar: propuso el horario', () => {
    const t = tallyProposal([], 2, 4, 'creator-1')
    expect(t.yes).toBe(1)
    expect(t.pending).toBe(3)
    expect(t.reached).toBe(false)
  })

  test('alcanza el umbral y lo dice', () => {
    const t = tallyProposal(
      [{ user_id: 'a', vote: 'yes' }, { user_id: 'b', vote: 'yes' }],
      3, 4, 'creator-1',
    )
    expect(t.yes).toBe(3)
    expect(t.reached).toBe(true)
  })

  test('los "no" no cuentan para el umbral pero sí salen del pendiente', () => {
    const t = tallyProposal(
      [{ user_id: 'a', vote: 'no' }, { user_id: 'b', vote: 'yes' }],
      3, 4, 'creator-1',
    )
    expect(t.yes).toBe(2)
    expect(t.no).toBe(1)
    expect(t.pending).toBe(1)
    expect(t.reached).toBe(false)
  })

  test('un voto duplicado no infla el conteo', () => {
    const t = tallyProposal(
      [{ user_id: 'a', vote: 'yes' }, { user_id: 'a', vote: 'yes' }],
      2, 3, 'creator-1',
    )
    expect(t.yes).toBe(2) // creador + a, no a dos veces
  })

  test('si el creador votó explícitamente no se cuenta dos veces', () => {
    const t = tallyProposal([{ user_id: 'creator-1', vote: 'yes' }], 2, 3, 'creator-1')
    expect(t.yes).toBe(1)
  })

  test('pending nunca es negativo aunque lleguen más votos que integrantes', () => {
    const t = tallyProposal(
      [{ user_id: 'a', vote: 'yes' }, { user_id: 'b', vote: 'yes' }],
      1, 1, 'creator-1',
    )
    expect(t.pending).toBe(0)
  })
})

test.describe('isProposalStale', () => {
  const p = { proposed_date: '2026-08-14', end_time: '13:35', status: 'open' }

  test('no está vencida antes de su hora de término', () => {
    expect(isProposalStale(p, new Date(2026, 7, 14, 13, 0))).toBe(false)
  })

  test('vence al pasar la hora de término: si no, queda abierta para siempre', () => {
    expect(isProposalStale(p, new Date(2026, 7, 14, 13, 36))).toBe(true)
  })

  test('una votación ya cerrada no se vuelve a vencer', () => {
    expect(isProposalStale({ ...p, status: 'confirmed' }, new Date(2099, 0, 1))).toBe(false)
  })
})

// ─────────────────────────── Descartes ───────────────────────────

test.describe('buildDiscardIndex', () => {
  const rows = [
    { user_id: 'ana', discard_date: '2026-08-14', hour: null },
    { user_id: 'ben', discard_date: '2026-08-14', hour: 19 },
    { user_id: 'ben', discard_date: '2026-08-15', hour: 20 },
  ]
  const idx = buildDiscardIndex(rows)

  test('el día completo cubre todas sus horas', () => {
    expect(idx.hasDay('ana', '2026-08-14')).toBe(true)
    expect(idx.hasHour('ana', '2026-08-14', 3)).toBe(true)
    expect(idx.hasHour('ana', '2026-08-14', 23)).toBe(true)
  })

  test('una hora suelta no marca el día', () => {
    expect(idx.hasDay('ben', '2026-08-14')).toBe(false)
    expect(idx.hasHour('ben', '2026-08-14', 19)).toBe(true)
    expect(idx.hasHour('ben', '2026-08-14', 20)).toBe(false)
  })

  test('usersAtHour junta a los del día completo con los de la hora', () => {
    expect(idx.usersAtHour('2026-08-14', 19).sort()).toEqual(['ana', 'ben'])
    expect(idx.usersAtHour('2026-08-14', 20)).toEqual(['ana'])
    expect(idx.usersAtDay('2026-08-14')).toEqual(['ana'])
  })

  test('otra fecha no se contamina', () => {
    expect(idx.hasHour('ana', '2026-08-15', 3)).toBe(false)
    expect(idx.usersAtHour('2026-08-15', 20)).toEqual(['ben'])
  })
})
