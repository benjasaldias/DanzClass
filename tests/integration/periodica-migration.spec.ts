/**
 * Integración (stack local Docker) — migración 067: periódicas a calendario.
 *
 * Lo que importa verificar no es que la migración corra, sino que NO PIERDA
 * SESIONES: una clase `weekly` con alumnos pagando tiene que quedar con
 * exactamente las mismas fechas que `getClassSessions` venía mostrando. Es la
 * parte de esta sesión donde un error es caro y silencioso (audit.md §7 S3).
 *
 * Requiere el stack local (`npm run db:start`). Correr con:
 *   npm run test:integration
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

for (const line of readFileSync(`${ROOT}/apps/web/.env.development.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAdminClient } = require(`${ROOT}/apps/web/src/lib/supabase/admin.ts`)
const {
  getClassSessions,
  parseLocalDate,
} = require(`${ROOT}/packages/shared/src/lib/classSchedule.ts`)

const admin = createAdminClient()
const stamp = Date.now()
const DB_CONTAINER = 'supabase_db_DanzClass'

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  )
}

function applyMigration067(): void {
  const sql = readFileSync(`${ROOT}/supabase/migrations/067_periodica_custom_dates_only.sql`, 'utf8')
  execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  )
}

async function mkTeacher(suffix: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `prof-${suffix}-${stamp}@periodicatest.local`,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { full_name: `Prof ${suffix} ${stamp}`, username: `prof${suffix}${stamp}` },
  })
  if (error) throw error
  return data.user.id
}

const created: string[] = []

test.afterAll(async () => {
  if (created.length) await admin.from('classes').delete().in('id', created)
  // La constraint tiene que quedar puesta pase lo que pase con el test.
  applyMigration067()
})

test('la migración 067 conserva exactamente las sesiones que mostraba getClassSessions', async () => {
  test.setTimeout(90_000)

  const teacherId = await mkTeacher('mig')

  // Para poder sembrar datos "pre-migración" hay que soltar la constraint:
  // el objetivo del test es justamente el camino que ya no se puede recorrer.
  psql('ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_periodica_custom_only;')

  const base = {
    teacher_id: teacherId,
    dance_style: 'House',
    level: 'todos' as const,
    type: 'periodica' as const,
    recurring_time: '19:00',
    duration_minutes: 60,
    max_spots: 10,
    price: 20000,
    status: 'active' as const,
    city: 'Santiago',
  }

  // 2027-06-07 es lunes.
  const legacy = [
    {
      ...base,
      title: `[TEST] weekly ${stamp}`,
      recurrence: 'weekly',
      day_of_week: 1,
      start_date: '2027-06-07',
      ends_at: '2027-06-28',
    },
    {
      ...base,
      title: `[TEST] biweekly ${stamp}`,
      recurrence: 'biweekly',
      day_of_week: 1,
      start_date: '2027-06-07',
      ends_at: '2027-07-05',
    },
    {
      // Cruza de mes a propósito: es lo que la regla de "un solo mes" prohíbe
      // para las clases NUEVAS, y lo que la migración debe conservar igual en
      // las heredadas en vez de truncar.
      ...base,
      title: `[TEST] weekly multi-mes ${stamp}`,
      recurrence: 'weekly',
      day_of_week: 4,
      start_date: '2027-06-03',
      ends_at: '2027-08-26',
    },
    {
      ...base,
      title: `[TEST] monthly dia31 ${stamp}`,
      recurrence: 'monthly',
      day_of_week: null,
      start_date: '2027-01-31',
      ends_at: '2027-04-30',
    },
  ]

  const { data: inserted, error: insErr } = await admin.from('classes').insert(legacy as any).select()
  expect(insErr, insErr ? JSON.stringify(insErr) : '').toBeNull()
  expect(inserted).toHaveLength(4)
  for (const row of inserted) created.push(row.id)

  // Lo que la app mostraba ANTES de migrar, con el motor compartido.
  const expected = new Map<string, string[]>()
  for (const row of inserted) {
    expected.set(
      row.id,
      getClassSessions(row, parseLocalDate(row.start_date), parseLocalDate(row.ends_at)),
    )
  }

  applyMigration067()

  const { data: after } = await admin.from('classes').select('*').in('id', created)
  expect(after).toHaveLength(4)

  for (const row of after!) {
    const want = expected.get(row.id)!
    expect(want.length, `${row.title}: el caso de prueba debe tener sesiones`).toBeGreaterThan(0)
    // 1. Ninguna sesión perdida ni inventada.
    expect(row.custom_dates, `${row.title}: fechas conservadas`).toEqual(want)
    // 2. La clase quedó en modo calendario.
    expect(row.recurrence, `${row.title}: recurrence`).toBe('custom')
    // 3. El ancla y el término quedaron alineados con el calendario.
    expect(row.start_date, `${row.title}: start_date`).toBe(want[0])
    expect(row.ends_at, `${row.title}: ends_at`).toBe(want[want.length - 1])
    // 4. Y `getClassSessions` sobre la fila migrada devuelve lo mismo que antes.
    expect(
      getClassSessions(row, parseLocalDate(want[0]), parseLocalDate(want[want.length - 1])),
      `${row.title}: sesiones post-migración`,
    ).toEqual(want)
  }

  // Caso concreto que la copia de mobile calculaba mal (desborde de setMonth).
  const monthly = after!.find((r: any) => r.title.includes('monthly dia31'))
  expect(monthly.custom_dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
})

test('el CHECK impide crear una periódica que no sea calendario, y no toca a los entrenamientos', async () => {
  test.setTimeout(60_000)

  applyMigration067() // idempotente: asegura la constraint puesta

  const teacherId = await mkTeacher('chk')
  const base = {
    teacher_id: teacherId,
    dance_style: 'House',
    level: 'todos' as const,
    recurring_time: '19:00',
    duration_minutes: 60,
    max_spots: 10,
    price: 20000,
    status: 'active' as const,
  }

  // Periódica semanal → rechazada por la base, no solo por el formulario.
  const { error: weeklyErr } = await admin.from('classes').insert({
    ...base, title: `[TEST] rechazada ${stamp}`, type: 'periodica',
    recurrence: 'weekly', day_of_week: 1, start_date: '2027-06-07', ends_at: '2027-06-28',
  } as any)
  expect(weeklyErr, 'una periódica weekly debe ser rechazada').not.toBeNull()
  expect(String(weeklyErr?.message)).toContain('classes_periodica_custom_only')

  // Periódica con calendario → aceptada.
  const { data: okRow, error: okErr } = await admin.from('classes').insert({
    ...base, title: `[TEST] periodica custom ${stamp}`, type: 'periodica',
    recurrence: 'custom', custom_dates: ['2027-06-07', '2027-06-14'],
    start_date: '2027-06-07', ends_at: '2027-06-14',
  } as any).select().single()
  expect(okErr, okErr ? JSON.stringify(okErr) : '').toBeNull()
  created.push(okRow.id)

  // Entrenamiento semanal → sigue permitido (decisión de producto: los
  // entrenamientos conservan la recurrencia semanal).
  const { data: trainRow, error: trainErr } = await admin.from('classes').insert({
    ...base, title: `[TEST] entrenamiento weekly ${stamp}`, type: 'entrenamiento',
    recurrence: 'weekly', day_of_week: 1, start_date: '2027-06-07',
    ends_indefinitely: true, billing_day: 1,
  } as any).select().single()
  expect(trainErr, trainErr ? JSON.stringify(trainErr) : '').toBeNull()
  created.push(trainRow.id)
})
