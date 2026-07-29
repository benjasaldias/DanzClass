/**
 * Integración (stack local Docker) — endurecimiento de la plataforma de pagos
 * (audit.md S5).
 *
 * Cubre los tres cambios de comportamiento que tocan dinero o acceso:
 *   1. P2-6 — un reembolso/contracargo de Mercado Pago revierte el pago y le
 *      quita el QR al alumno (y, en un entrenamiento, devuelve el mes a deuda
 *      sin tocar la inscripción).
 *   2. P2-4 — desconectar Mercado Pago no puede dejar clases sin ninguna vía de
 *      pago para alumnos que ya tienen deuda.
 *   3. D-4 / paquetes — el comprobante debe subirse bajo la carpeta del propio
 *      usuario: la policy del bucket lo exige y el código de paquetes no lo
 *      hacía, así que esa vía de pago no funcionaba.
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
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}
// El QR se emite dentro de autoConfirmPayment: sin secreto no habría token que
// comprobar que se revoca.
process.env.QR_TOKEN_SECRET ??= 'integration-test-secret'

if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createClient } = require('@supabase/supabase-js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAdminClient } = require(`${ROOT}/apps/web/src/lib/supabase/admin.ts`)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoConfirmPayment, reverseClassPayment } = require(`${ROOT}/apps/web/src/lib/payments.ts`)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { markMpDisconnected } = require(`${ROOT}/apps/web/src/lib/mercadopago/connection.ts`)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarizeCharges, billingPeriodOf } = require(`${ROOT}/packages/shared/src/lib/monthlyCharges.ts`)

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'Test1234!'

const admin = createAdminClient()
const stamp = Date.now()

async function mkUser(prefix: string): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${stamp}@paytest.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `${prefix} ${stamp}`, username: `${prefix}${stamp}` },
  })
  if (error) throw error
  return { id: data.user.id, email }
}

async function ins(table: string, row: Record<string, any>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select('id').single()
  if (error) throw new Error(`seed ${table}: ${error.message}`)
  return data.id
}

async function one(table: string, id: string, cols: string): Promise<any> {
  const { data } = await admin.from(table).select(cols).eq('id', id).maybeSingle()
  return data
}

const classBase = (teacherId: string) => ({
  teacher_id: teacherId,
  dance_style: 'House',
  time: '20:00',
  duration_minutes: 60,
  max_spots: 10,
  city: 'Santiago',
  status: 'active',
})

test.describe('P2-6 · reembolso de un pago único', () => {
  test('revierte el pago, devuelve la inscripción a pendiente y revoca el QR', async () => {
    const teacher = await mkUser('refprof')
    const student = await mkUser('refalu')

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[TEST] reembolso suelta',
      type: 'suelta',
      date: '2027-05-10',
      price: 15000,
      accepts_mp: true,
    })
    const enrollmentId = await ins('enrollments', {
      class_id: classId,
      student_id: student.id,
      status: 'pending_payment',
    })
    const paymentId = await ins('payments', {
      enrollment_id: enrollmentId,
      amount: 15000,
      commission_amount: 300,
      payment_method: 'mp',
      status: 'pending',
      recipient_teacher_id: teacher.id,
    })

    // Camino normal: MP aprueba → se confirma la inscripción y se emite el QR.
    await autoConfirmPayment({
      paymentId,
      enrollmentId,
      studentId: student.id,
      classId,
      classTitle: '[TEST] reembolso suelta',
      confirmedBy: null,
      mp: { paymentId: `mp-${stamp}-1`, status: 'approved', feeAmount: 580 },
    })

    expect((await one('enrollments', enrollmentId, 'status')).status).toBe('confirmed')
    const { data: tokenBefore } = await admin
      .from('qr_tokens').select('status').eq('enrollment_id', enrollmentId).maybeSingle()
    expect(tokenBefore?.status).toBe('active')
    // D-2: el costo real informado por MP queda persistido para la conciliación.
    expect((await one('payments', paymentId, 'mp_fee_amount')).mp_fee_amount).toBe(580)

    // El alumno pide el reembolso.
    const payRow = await one('payments', paymentId, 'id, status, enrollment_id, billing_period')
    await reverseClassPayment(admin, payRow, { paymentId: `mp-${stamp}-1`, status: 'refunded', feeAmount: 580 })

    const payment = await one('payments', paymentId, 'status, mp_status, confirmed_by, verified_at')
    expect(payment.status).toBe('refunded')
    expect(payment.mp_status).toBe('refunded')
    expect(payment.confirmed_by).toBeNull()
    expect(payment.verified_at).toBeNull()

    // Antes de este fix el alumno conservaba inscripción confirmada y QR válido.
    expect((await one('enrollments', enrollmentId, 'status')).status).toBe('pending_payment')
    const { data: tokenAfter } = await admin
      .from('qr_tokens').select('status').eq('enrollment_id', enrollmentId).maybeSingle()
    expect(tokenAfter?.status).toBe('revoked')

    // Se avisa a las dos partes: el profesor perdió el ingreso.
    const { data: notifs } = await admin
      .from('notifications').select('user_id, type').eq('type', 'payment_refunded')
      .in('user_id', [student.id, teacher.id])
    expect((notifs ?? []).map((n: any) => n.user_id).sort()).toEqual([student.id, teacher.id].sort())
  })
})

test.describe('P2-6 · contracargo de una mensualidad de entrenamiento', () => {
  test('el mes vuelve a ser deuda y la inscripción NO se toca', async () => {
    const teacher = await mkUser('refprof2')
    const student = await mkUser('refalu2')

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[TEST] reembolso entrenamiento',
      type: 'entrenamiento',
      recurrence: 'weekly',
      day_of_week: 1,
      start_date: '2026-01-05',
      ends_indefinitely: true,
      price: 40000,
      billing_day: 5,
      accepts_mp: true,
    })
    const enrollmentId = await ins('enrollments', {
      class_id: classId,
      student_id: student.id,
      status: 'confirmed',
    })
    const period = billingPeriodOf()
    const chargeId = await ins('payments', {
      enrollment_id: enrollmentId,
      amount: 40000,
      billing_period: period,
      payment_method: 'mp',
      status: 'pending',
      recipient_teacher_id: teacher.id,
    })

    await autoConfirmPayment({
      paymentId: chargeId,
      enrollmentId,
      studentId: student.id,
      classId,
      classTitle: '[TEST] reembolso entrenamiento',
      confirmedBy: null,
      mp: { paymentId: `mp-${stamp}-2`, status: 'approved' },
    })

    const payRow = await one('payments', chargeId, 'id, status, enrollment_id, billing_period')
    await reverseClassPayment(admin, payRow, { paymentId: `mp-${stamp}-2`, status: 'charged_back' })

    // Expulsar de la clase a un alumno de dos años por un contracargo de este
    // mes sería lo contrario del modelo: la inscripción es permanente.
    expect((await one('enrollments', enrollmentId, 'status')).status).toBe('confirmed')

    const { data: rows } = await admin
      .from('payments').select('id, billing_period, amount, status').eq('enrollment_id', enrollmentId)
    const debt = summarizeCharges(rows ?? [], 5, '2099-12-31')
    expect(debt.unpaid).toHaveLength(1)
    expect(debt.paid).toHaveLength(0)
    expect(debt.hasOverdue).toBe(true) // el gate del QR es quien corta el acceso
  })
})

test.describe('P2-4 · desconectar Mercado Pago', () => {
  test('activa la transferencia en las clases que quedarían impagables', async () => {
    const teacher = await mkUser('discprof')
    const student = await mkUser('discalu')

    const onlyMp = await ins('classes', {
      ...classBase(teacher.id),
      title: '[TEST] solo MP',
      type: 'suelta',
      date: '2027-05-10',
      price: 12000,
      accepts_mp: true,
      accepts_transfer: false,
    })
    const bothWays = await ins('classes', {
      ...classBase(teacher.id),
      title: '[TEST] ambas vías',
      type: 'suelta',
      date: '2027-05-11',
      price: 12000,
      accepts_mp: true,
      accepts_transfer: true,
    })
    await ins('enrollments', { class_id: onlyMp, student_id: student.id, status: 'pending_payment' })
    await admin.from('profiles').update({ mp_connected: true }).eq('id', teacher.id)
    await admin.from('teacher_mp_connections').insert({
      teacher_id: teacher.id,
      mp_user_id: `mp-${stamp}`,
      access_token: 'tok',
      refresh_token: 'ref',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })

    const summary = await markMpDisconnected(admin, teacher.id, { deleteTokens: true })

    expect(summary.classesRepaired).toBe(1)
    expect(summary.affectedStudents).toBe(1)
    expect(summary.hasPaymentInfo).toBe(false) // el profesor no cargó datos bancarios

    // La clase que solo aceptaba MP queda pagable por transferencia...
    expect((await one('classes', onlyMp, 'accepts_transfer')).accepts_transfer).toBe(true)
    // ...y la que ya aceptaba las dos no se toca (sigue con MP marcado, que es
    // la preferencia del profesor si vuelve a conectarse).
    expect((await one('classes', bothWays, 'accepts_mp')).accepts_mp).toBe(true)

    expect((await one('profiles', teacher.id, 'mp_connected')).mp_connected).toBe(false)
    const { data: conn } = await admin
      .from('teacher_mp_connections').select('teacher_id').eq('teacher_id', teacher.id).maybeSingle()
    expect(conn).toBeNull()
  })
})

test.describe('paquetes · path del comprobante', () => {
  test('la policy del bucket exige la carpeta del usuario (la vía de pago de paquetes estaba rota)', async () => {
    const student = await mkUser('pkgalu')
    const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signInErr } = await client.auth.signInWithPassword({ email: student.email, password: PASSWORD })
    expect(signInErr).toBeNull()

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

    // Formato que usaba PackageSection: sin carpeta → `storage.foldername()`
    // devuelve un array vacío y la policy de INSERT (migración 007) rechaza.
    const bad = await client.storage
      .from('payment-receipts')
      .upload(`pkg_${stamp}.jpg`, jpeg, { contentType: 'image/jpeg', upsert: true })
    expect(bad.error).not.toBeNull()

    const good = await client.storage
      .from('payment-receipts')
      .upload(`${student.id}/pkg_${stamp}.jpg`, jpeg, { contentType: 'image/jpeg', upsert: true })
    expect(good.error).toBeNull()
  })
})
