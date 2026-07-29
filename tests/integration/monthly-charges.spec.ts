/**
 * Integración (stack local Docker) — cobro mensual de entrenamientos (audit.md S4).
 *
 * Cubre el ciclo completo que pide el plan: generar cargo, no pagar, perder el
 * QR, acumular dos meses, pagar atrasado, confirmar sin comprobante, y que el
 * Panel Financiero sume cada mes por separado.
 *
 * Requiere el stack local (`npm run db:start`). Correr con:
 *   npm run test:integration
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

for (const line of readFileSync(`${ROOT}/apps/web/.env.development.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
// El QR se emite dentro de autoConfirmPayment: sin secreto, la emisión falla
// (best-effort) y el test no podría comprobar que el token existe.
process.env.QR_TOKEN_SECRET ??= 'integration-test-secret'

if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAdminClient } = require(`${ROOT}/apps/web/src/lib/supabase/admin.ts`)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarizeCharges, billingPeriodOf, shiftBillingPeriod } = require(`${ROOT}/packages/shared/src/lib/monthlyCharges.ts`)

// Los dos tests comparten la clase/inscripción sembrada por el primero.
test.describe.configure({ mode: 'serial' })

const admin = createAdminClient()
const stamp = Date.now()
const ids: { teacher?: string; student?: string; classId?: string; enrollmentId?: string } = {}

const BILLING_DAY = 5
const MONTHLY_PRICE = 40000

async function mkUser(prefix: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}-${stamp}@chargetest.local`,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { full_name: `${prefix} ${stamp}`, username: `${prefix}${stamp}` },
  })
  if (error) throw error
  return data.user.id
}

async function charges(): Promise<any[]> {
  const { data } = await admin
    .from('payments')
    .select('id, billing_period, amount, status, receipt_url, offline_confirmed')
    .eq('enrollment_id', ids.enrollmentId!)
    .not('billing_period', 'is', null)
    .order('billing_period', { ascending: true })
  return (data ?? []) as any[]
}

test('cobro mensual de entrenamiento: emisión, deuda acumulada, QR y pago atrasado', async () => {
  test.setTimeout(90_000)

  ids.teacher = await mkUser('chprof')
  ids.student = await mkUser('chalu')

  // Entrenamiento que empezó hace 3 meses → al generar deben aparecer varios
  // períodos de una sola pasada (la función es auto-reparadora, no depende de
  // que el cron haya corrido cada mes).
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  threeMonthsAgo.setDate(1)
  const startDate = threeMonthsAgo.toISOString().slice(0, 10)

  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .insert({
      teacher_id: ids.teacher,
      title: '[TEST] entrenamiento cobro mensual',
      type: 'entrenamiento',
      dance_style: 'House',
      recurrence: 'weekly',
      day_of_week: 1,
      recurring_time: '20:00',
      start_date: startDate,
      ends_indefinitely: true,
      price: MONTHLY_PRICE,
      billing_day: BILLING_DAY,
      max_spots: 20,
      city: 'Santiago',
      level: 'principiante',
      status: 'active',
    } as any)
    .select('id')
    .single()
  if (clsErr) throw clsErr
  ids.classId = (cls as any).id

  const { data: enr, error: enrErr } = await admin
    .from('enrollments')
    .insert({
      student_id: ids.student,
      class_id: ids.classId,
      session_id: null,
      status: 'pending_payment',
    } as any)
    .select('id')
    .single()
  if (enrErr) throw enrErr
  ids.enrollmentId = (enr as any).id

  // El alumno entró al programa hace 3 meses. Sin retrodatar `created_at`, la
  // ventana de cobro arranca en el mes de la inscripción (que es hoy) y no
  // habría deuda acumulada que probar — es, de hecho, el comportamiento
  // correcto para un alumno recién inscrito: no se le cobran meses anteriores
  // a su entrada aunque la clase lleve años.
  await admin
    .from('enrollments')
    .update({ created_at: threeMonthsAgo.toISOString() } as any)
    .eq('id', ids.enrollmentId)

  // ── 1. Emisión: todos los meses desde el inicio, ninguno de más ───────────
  const { data: created, error: genErr } = await (admin as any).rpc('generate_monthly_charges', {
    p_enrollment_id: ids.enrollmentId,
  })
  expect(genErr, 'generate_monthly_charges no debe fallar').toBeNull()
  expect(Number(created), 'debe emitir al menos 3 meses').toBeGreaterThanOrEqual(3)

  const emitted = await charges()
  expect(emitted.every((c) => c.status === 'due'), 'todo cargo nace en due').toBe(true)
  expect(emitted.every((c) => c.amount === MONTHLY_PRICE), 'monto = precio mensual').toBe(true)
  expect(emitted.every((c) => c.receipt_url === null), 'un cargo emitido no tiene comprobante').toBe(true)

  // El mes en curso sólo se cobra si ya pasó el billing_day (para un alumno que
  // ya venía inscrito; el primero de su inscripción se emite igual, ver el test
  // siguiente).
  const current = billingPeriodOf()
  const todayDay = Number(new Date().toISOString().slice(8, 10))
  const periods = emitted.map((c) => c.billing_period)
  expect(periods).toContain(shiftBillingPeriod(current, -1))
  if (todayDay >= BILLING_DAY) {
    expect(periods, 'ya pasó el día de cobro → el mes en curso se cobra').toContain(current)
  } else {
    expect(periods, 'antes del día de cobro no se cobra el mes en curso').not.toContain(current)
  }
  // Nunca por delante del mes en curso.
  expect(periods.every((p: string) => p <= current)).toBe(true)

  // ── 2. Idempotencia ───────────────────────────────────────────────────────
  const { data: second } = await (admin as any).rpc('generate_monthly_charges', {
    p_enrollment_id: ids.enrollmentId,
  })
  expect(Number(second), 'volver a correrla no crea nada').toBe(0)
  expect(await charges()).toHaveLength(emitted.length)

  // ── 3. Deuda acumulada + QR bloqueado ─────────────────────────────────────
  const debt = summarizeCharges(await charges(), BILLING_DAY)
  expect(debt.unpaid.length, 'todos los meses figuran impagos').toBe(emitted.length)
  expect(debt.totalUnpaid).toBe(emitted.length * MONTHLY_PRICE)
  expect(debt.hasOverdue, 'meses viejos → deuda vencida → sin QR').toBe(true)
  expect(debt.oldestUnpaid.billing_period).toBe(periods[0])

  // ── 4. El alumno paga el mes más antiguo (comprobante) ────────────────────
  const oldest = emitted[0]
  await admin
    .from('payments')
    .update({ receipt_url: `${ids.student}/receipt.jpg`, status: 'pending' } as any)
    .eq('id', oldest.id)

  const afterSubmit = summarizeCharges(await charges(), BILLING_DAY)
  expect(afterSubmit.inReview, 'el comprobante enviado sale de la deuda vencida').toHaveLength(1)
  expect(afterSubmit.unpaid.length).toBe(emitted.length - 1)
  expect(
    afterSubmit.overdue.some((c: any) => c.id === oldest.id),
    'un cargo en revisión nunca cuenta como vencido'
  ).toBe(false)

  // ── 5. El profesor lo confirma (camino compartido autoConfirmPayment) ─────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoConfirmPayment } = require(`${ROOT}/apps/web/src/lib/payments.ts`)
  await autoConfirmPayment({
    paymentId: oldest.id,
    enrollmentId: ids.enrollmentId!,
    studentId: ids.student!,
    classId: ids.classId!,
    classTitle: '[TEST] entrenamiento cobro mensual',
    confirmedBy: 'teacher',
  })

  const afterConfirm = await charges()
  expect(afterConfirm.find((c) => c.id === oldest.id)!.status).toBe('verified')
  // La inscripción queda confirmada y con QR emitido.
  const { data: enrRow } = await admin.from('enrollments').select('status').eq('id', ids.enrollmentId!).single()
  expect((enrRow as any).status).toBe('confirmed')
  const { data: qr } = await admin.from('qr_tokens').select('token, status').eq('enrollment_id', ids.enrollmentId!).maybeSingle()
  expect((qr as any)?.status, 'confirmar emite el token QR').toBe('active')
  const firstToken = (qr as any).token

  // Confirmar OTRO mes no debe rotar el token: el alumno guarda su QR como
  // captura y rotarlo cada mes lo dejaría afuera de la clase.
  const secondCharge = afterConfirm.find((c) => c.status === 'due')!
  await autoConfirmPayment({
    paymentId: secondCharge.id,
    enrollmentId: ids.enrollmentId!,
    studentId: ids.student!,
    classId: ids.classId!,
    classTitle: '[TEST] entrenamiento cobro mensual',
    confirmedBy: 'teacher',
  })
  const { data: qr2 } = await admin.from('qr_tokens').select('token').eq('enrollment_id', ids.enrollmentId!).maybeSingle()
  expect((qr2 as any).token, 'un pago mensual no rota el QR ya activo').toBe(firstToken)

  // ── 6. Sigue habiendo deuda: la inscripción confirmada no la borra ────────
  const stillOwed = summarizeCharges(await charges(), BILLING_DAY)
  expect(stillOwed.unpaid.length, 'quedan meses por pagar pese al confirmed').toBeGreaterThan(0)

  // ── 7. Confirmación sin comprobante (efectivo) ────────────────────────────
  const cashCharge = stillOwed.unpaid[0]
  await admin.from('payments').update({ offline_confirmed: true } as any).eq('id', cashCharge.id)
  await autoConfirmPayment({
    paymentId: cashCharge.id,
    enrollmentId: ids.enrollmentId!,
    studentId: ids.student!,
    classId: ids.classId!,
    classTitle: '[TEST] entrenamiento cobro mensual',
    confirmedBy: 'teacher',
  })
  const cashRow = (await charges()).find((c) => c.id === cashCharge.id)!
  expect(cashRow.status).toBe('verified')
  expect(cashRow.offline_confirmed, 'queda marcado como pago sin comprobante').toBe(true)
  expect(cashRow.receipt_url, 'y sin comprobante asociado').toBeNull()

  // ── 8. El Panel Financiero suma cada mes por separado ─────────────────────
  const verified = (await charges()).filter((c) => c.status === 'verified')
  expect(verified.length).toBe(3)
  expect(
    new Set(verified.map((c) => c.billing_period)).size,
    'tres pagos verificados de TRES meses distintos, no tres del mismo'
  ).toBe(3)
  const { data: summary } = await (admin as any).rpc('teacher_financial_summary')
  // El RPC filtra por auth.uid(), que en service role es NULL: no puede
  // comprobarse el total del profesor desde acá, sólo que la llamada no rompe
  // con varios pagos por inscripción (antes había como mucho uno).
  expect(summary, 'el resumen financiero sigue respondiendo').toBeTruthy()
})

test('la unicidad protege lo de siempre: un solo cargo por mes, un solo pago único', async () => {
  test.setTimeout(30_000)

  // Un segundo cargo del mismo mes debe rebotar contra payments_one_per_period.
  const existing = (await charges())[0]
  const { error: dupErr } = await admin.from('payments').insert({
    enrollment_id: ids.enrollmentId,
    amount: MONTHLY_PRICE,
    status: 'due',
    payment_method: 'transfer',
    billing_period: existing.billing_period,
  } as any)
  expect(dupErr?.code, 'dos cargos del mismo mes → 23505').toBe('23505')

  // Y en una clase normal sigue habiendo como mucho UN pago por inscripción
  // (índice parcial payments_one_per_enrollment): es la invariante que toda la
  // app asumía antes de la migración 068 y que no debe haberse relajado.
  const { data: cls } = await admin
    .from('classes')
    .insert({
      teacher_id: ids.teacher,
      title: '[TEST] suelta unicidad',
      type: 'suelta',
      dance_style: 'House',
      date: '2030-01-15',
      time: '20:00',
      price: 12000,
      max_spots: 10,
      city: 'Santiago',
      level: 'principiante',
      status: 'active',
    } as any)
    .select('id')
    .single()

  const { data: enr } = await admin
    .from('enrollments')
    .insert({ student_id: ids.student, class_id: (cls as any).id, session_id: null, status: 'pending_payment' } as any)
    .select('id')
    .single()

  const row = { enrollment_id: (enr as any).id, amount: 12000, status: 'pending', payment_method: 'transfer' }
  const { error: firstErr } = await admin.from('payments').insert(row as any)
  expect(firstErr).toBeNull()
  const { error: secondErr } = await admin.from('payments').insert(row as any)
  expect(secondErr?.code, 'dos pagos únicos en la misma inscripción → 23505').toBe('23505')

  await admin.from('classes').delete().eq('id', (cls as any).id)
})

test('el primer mes se emite al inscribirse, sin esperar al día de cobro', async () => {
  test.setTimeout(30_000)

  // `billing_day` deliberadamente en el futuro respecto de hoy (o 27, el máximo,
  // si hoy ya es fin de mes): sin la regla del primer mes, este alumno no
  // tendría ningún cargo que pagar hasta esa fecha — y por lo tanto ninguna
  // forma de habilitar su QR el día que entra al programa.
  const today = new Date().getDate()
  const futureBillingDay = Math.min(Math.max(today + 1, 2), 27)

  const { data: cls } = await admin
    .from('classes')
    .insert({
      teacher_id: ids.teacher,
      title: '[TEST] entrenamiento primer mes',
      type: 'entrenamiento',
      dance_style: 'House',
      recurrence: 'weekly',
      day_of_week: 1,
      recurring_time: '20:00',
      start_date: new Date().toISOString().slice(0, 10),
      ends_indefinitely: true,
      price: MONTHLY_PRICE,
      billing_day: futureBillingDay,
      max_spots: 20,
      city: 'Santiago',
      level: 'principiante',
      status: 'active',
    } as any)
    .select('id')
    .single()

  const { data: enr } = await admin
    .from('enrollments')
    .insert({ student_id: ids.student, class_id: (cls as any).id, session_id: null, status: 'pending_payment' } as any)
    .select('id')
    .single()

  await (admin as any).rpc('generate_monthly_charges', { p_enrollment_id: (enr as any).id })

  const { data: rows } = await admin
    .from('payments')
    .select('billing_period, status')
    .eq('enrollment_id', (enr as any).id)

  expect(rows, 'el alumno recién inscrito ya tiene su primer cargo').toHaveLength(1)
  expect((rows as any[])[0].billing_period).toBe(billingPeriodOf())
  expect((rows as any[])[0].status).toBe('due')

  await admin.from('classes').delete().eq('id', (cls as any).id)
})

test.afterAll(async () => {
  if (ids.classId) await admin.from('classes').delete().eq('id', ids.classId)
  for (const key of ['teacher', 'student'] as const) {
    if (ids[key]) await admin.auth.admin.deleteUser(ids[key]!)
  }
})
