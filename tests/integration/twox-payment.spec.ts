/**
 * Integración (stack local Docker) — confirmación de un pago 2x.
 *
 * Verifica el fix de marketplace-payments-v2-plan.md §3: un único pago 2x
 * (registrado contra el enrollment del payment_assignee) debe confirmar las DOS
 * inscripciones, y al rechazarlo/revertirlo debe des-confirmar al compañero.
 *
 * Requiere el stack local (`npm run db:start`). Correr con:
 *   npm run test:integration
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'

import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

// Cargar .env.development.local (stack local) antes de importar los módulos
// del server, que leen process.env al construir el cliente.
for (const line of readFileSync(`${ROOT}/apps/web/.env.development.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

// supabase-js instancia el cliente Realtime aunque no lo usemos, y en Node < 22
// no hay WebSocket nativo (en Next.js/Vercel sí lo hay). Se lo damos nosotros.
if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAdminClient } = require(`${ROOT}/apps/web/src/lib/supabase/admin.ts`)
const { autoConfirmPayment, unconfirmTwoxPartner } = require(`${ROOT}/apps/web/src/lib/payments.ts`)

const admin = createAdminClient()
const stamp = Date.now()
const ids: { teacher?: string; s1?: string; s2?: string; classId?: string } = {}

async function mkUser(prefix: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}-${stamp}@twoxtest.local`,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { full_name: `${prefix} ${stamp}`, username: `${prefix}${stamp}` },
  })
  if (error) throw error
  return data.user.id
}

test('un pago 2x confirma ambas inscripciones, y al rechazarlo se revierten ambas', async () => {
  test.setTimeout(60_000)

  ids.teacher = await mkUser('prof')
  ids.s1 = await mkUser('alu1')
  ids.s2 = await mkUser('alu2')

  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .insert({
      teacher_id: ids.teacher,
      title: '[TEST] 2x confirm',
      type: 'suelta',
      dance_style: 'House',
      date: '2027-01-15',
      time: '20:00',
      duration_minutes: 60,
      max_spots: 10,
      price: 15000,
      price_2x: 24000,
      city: 'Santiago',
      status: 'active',
    })
    .select('id, accepts_mp, accepts_transfer')
    .single()
  if (clsErr) throw clsErr
  ids.classId = cls.id

  // Migración 061: una clase nueva acepta ambas vías sin especificar nada.
  expect(cls.accepts_mp).toBe(true)
  expect(cls.accepts_transfer).toBe(true)

  const { data: enrollA, error: eA } = await admin
    .from('enrollments')
    .insert({ student_id: ids.s1, class_id: cls.id, session_id: null, status: 'pending_payment', is_2x: true })
    .select('id')
    .single()
  if (eA) throw eA

  const { data: enrollB, error: eB } = await admin
    .from('enrollments')
    .insert({
      student_id: ids.s2,
      class_id: cls.id,
      session_id: null,
      status: 'pending_payment',
      is_2x: true,
      partner_enrollment_id: enrollA.id,
    })
    .select('id')
    .single()
  if (eB) throw eB

  await admin.from('enrollments').update({ partner_enrollment_id: enrollB.id }).eq('id', enrollA.id)

  // El pago vive solo contra el enrollment del payment_assignee (A).
  const { data: pay, error: pErr } = await admin
    .from('payments')
    .insert({
      enrollment_id: enrollA.id,
      amount: 24000,
      commission_amount: 0,
      payment_method: 'transfer',
      status: 'pending',
      recipient_teacher_id: ids.teacher,
    })
    .select('id')
    .single()
  if (pErr) throw pErr

  // ── Confirmación (camino compartido por profesor / IA / webhook MP) ──
  await autoConfirmPayment({
    paymentId: pay.id,
    enrollmentId: enrollA.id,
    studentId: ids.s1,
    classId: cls.id,
    classTitle: '[TEST] 2x confirm',
    confirmedBy: 'teacher',
  })

  const after = await admin
    .from('enrollments')
    .select('id, status, student_id')
    .in('id', [enrollA.id, enrollB.id])
  const byId = Object.fromEntries(after.data.map((e: any) => [e.id, e]))

  expect(byId[enrollA.id].status).toBe('confirmed')
  expect(byId[enrollB.id].status).toBe('confirmed') // ← el bug §3: antes quedaba pending_payment

  // Ambos alumnos deben quedar notificados y con QR de asistencia.
  const { data: notifs } = await admin
    .from('notifications')
    .select('user_id, type')
    .in('user_id', [ids.s1, ids.s2])
    .eq('type', 'payment_confirmed')
  expect(new Set(notifs.map((n: any) => n.user_id))).toEqual(new Set([ids.s1, ids.s2]))

  const { data: tokens } = await admin
    .from('qr_tokens')
    .select('enrollment_id, status')
    .in('enrollment_id', [enrollA.id, enrollB.id])
  expect(tokens.length).toBe(2)
  expect(tokens.every((t: any) => t.status === 'active')).toBe(true)

  // Idempotencia: reenvío del webhook / doble clic no debe romper nada.
  await autoConfirmPayment({
    paymentId: pay.id,
    enrollmentId: enrollA.id,
    studentId: ids.s1,
    classId: cls.id,
    classTitle: '[TEST] 2x confirm',
    confirmedBy: 'teacher',
  })
  const { data: again } = await admin.from('enrollments').select('status').eq('id', enrollB.id).single()
  expect(again.status).toBe('confirmed')
  const { data: notifs2 } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', ids.s2)
    .eq('type', 'payment_confirmed')
  expect(notifs2.length).toBe(1) // no re-notifica al compañero ya confirmado

  // ── Rechazo / reversión: el compañero tampoco puede seguir confirmado ──
  await unconfirmTwoxPartner(admin, enrollA.id)
  const { data: reverted } = await admin.from('enrollments').select('status').eq('id', enrollB.id).single()
  expect(reverted.status).toBe('pending_payment')
  const { data: tok2 } = await admin.from('qr_tokens').select('status').eq('enrollment_id', enrollB.id).single()
  expect(tok2.status).toBe('revoked')

  // ── Query del turno de pago que usa /api/mercadopago/create-payment ──
  // (se prueba acá, contra PostgREST real, porque un .or()/.maybeSingle() mal
  // formado solo falla en runtime, no en el typecheck).
  await admin.from('class_2x_requests').insert({
    user_id: ids.s1,
    class_id: cls.id,
    matched_with: ids.s2,
    status: 'matched',
    payment_assignee: ids.s1,
  })

  for (const [uid, expected] of [[ids.s1, ids.s1], [ids.s2, ids.s1]] as const) {
    const { data: req2x, error } = await admin
      .from('class_2x_requests')
      .select('id, payment_assignee')
      .eq('class_id', cls.id)
      .eq('status', 'matched')
      .or(`user_id.eq.${uid},matched_with.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()
    expect(req2x?.payment_assignee).toBe(expected) // s2 la encuentra, pero no es su turno
  }
})

test.afterAll(async () => {
  if (ids.classId) await admin.from('classes').delete().eq('id', ids.classId)
  for (const id of [ids.teacher, ids.s1, ids.s2]) {
    if (id) await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})
