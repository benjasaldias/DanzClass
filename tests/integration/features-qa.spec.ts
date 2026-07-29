/**
 * Integración (stack local Docker) — QA de las cuatro features del lanzamiento
 * que nunca se habían recorrido end-to-end: Chat, Paquetes, Eventos y Ensayos
 * (audit.md S7).
 *
 * Cada bloque fija el comportamiento de un defecto encontrado en esa sesión, de
 * modo que la próxima migración o refactor no lo reabra en silencio:
 *
 *   Chat      — Realtime entrega el mensaje (migración 071: la publicación
 *               `supabase_realtime` estaba VACÍA, así que ningún mensaje llegaba
 *               nunca); la fuga de lectura que cerró 059 sigue cerrada;
 *               `/api/chat/list` devuelve `participants` y `last_read_at` (sin
 *               ellos la lista de mobile pierde nombre/foto y el punto de "no
 *               leído" queda encendido para siempre); y un profesor no puede
 *               abrir chat con alguien que no está inscrito en su clase.
 *   Paquetes  — confirmar registra los pagos y emite el token QR (antes dejaba
 *               al alumno `confirmed` sin QR y sin un peso en el Panel
 *               Financiero); rechazar devuelve las inscripciones a pendiente.
 *   Eventos   — el comprobante va al bucket PRIVADO y sólo alumno y organizador
 *               obtienen su URL firmada; confirmar/rechazar pasa por ruta de
 *               servidor y avisa al alumno.
 *   Ensayos   — un usuario sin invitación no ve el ensayo; el invitado responde
 *               y el creador recibe la notificación.
 *
 * Los bloques marcados con `needsServer` hablan por HTTP con la app real: hay
 * que tener `npm run dev:web` corriendo (apuntando al stack local). Si no está,
 * se saltan en vez de fallar.
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
process.env.QR_TOKEN_SECRET ??= 'integration-test-secret'

if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP = process.env.QA_APP_URL ?? 'http://localhost:3000'
const PASSWORD = 'Test1234!'

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now()

let serverUp = false

type User = { id: string; email: string; token: string; client: any }

async function mkUser(prefix: string): Promise<User> {
  const email = `${prefix}-${stamp}@qatest.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `${prefix} ${stamp}`, username: `${prefix}${stamp}` },
  })
  if (error) throw error
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInErr) throw signInErr
  return { id: data.user.id, email, token: session.session.access_token, client }
}

async function ins(table: string, row: Record<string, any>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select('id').single()
  if (error) throw new Error(`seed ${table}: ${error.message}`)
  return data.id
}

async function api(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${APP}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
}

const classBase = (teacherId: string) => ({
  teacher_id: teacherId,
  dance_style: 'House',
  type: 'suelta',
  time: '20:00',
  duration_minutes: 60,
  max_spots: 10,
  city: 'Santiago',
  status: 'active',
})

let teacher: User
let student: User
let outsider: User

test.beforeAll(async () => {
  teacher = await mkUser('qaprof')
  student = await mkUser('qaalu')
  outsider = await mkUser('qaotro')

  try {
    const res = await fetch(`${APP}/api/chat/list`, { headers: { Authorization: 'Bearer nope' } })
    serverUp = res.status !== 0
  } catch {
    serverUp = false
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chat', () => {
  test('Realtime entrega el mensaje nuevo a los participantes', async () => {
    const classId = await ins('classes', { ...classBase(teacher.id), title: '[QA] chat realtime', date: '2027-04-01', price: 10000 })
    await ins('enrollments', { class_id: classId, student_id: student.id, status: 'confirmed' })
    const chatId = await ins('chats', { type: 'class', class_id: classId, student_id: student.id })
    await admin.from('chat_participants').insert([
      { chat_id: chatId, user_id: student.id },
      { chat_id: chatId, user_id: teacher.id },
    ])

    const received: any[] = []
    const channel = student.client
      .channel(`qa-chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
        (payload: any) => received.push(payload.new),
      )

    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('la suscripción Realtime no llegó a SUBSCRIBED')), 15_000)
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); done() }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); fail(new Error(status)) }
      })
    })

    await admin.from('chat_messages').insert({ chat_id: chatId, sender_id: teacher.id, content: 'hola desde el profe' })

    // Sin la migración 071 (tabla fuera de la publicación) esto nunca llega.
    await expect.poll(() => received.length, { timeout: 10_000, intervals: [200] }).toBeGreaterThan(0)
    expect(received[0].content).toBe('hola desde el profe')

    await student.client.removeChannel(channel)
  })

  test('un participante NO puede leer los mensajes de otro chat (059)', async () => {
    const classId = await ins('classes', { ...classBase(teacher.id), title: '[QA] chat ajeno', date: '2027-04-02', price: 10000 })
    await ins('enrollments', { class_id: classId, student_id: outsider.id, status: 'confirmed' })
    const otherChat = await ins('chats', { type: 'class', class_id: classId, student_id: outsider.id })
    await admin.from('chat_participants').insert([
      { chat_id: otherChat, user_id: outsider.id },
      { chat_id: otherChat, user_id: teacher.id },
    ])
    await admin.from('chat_messages').insert({ chat_id: otherChat, sender_id: outsider.id, content: 'privado' })

    const { data: leaked } = await student.client.from('chat_messages').select('id').eq('chat_id', otherChat)
    expect(leaked ?? []).toHaveLength(0)

    const { error: insertErr } = await student.client
      .from('chat_messages')
      .insert({ chat_id: otherChat, sender_id: student.id, content: 'me cuelo' })
    expect(insertErr).toBeTruthy()
  })

  test('/api/chat/list devuelve participants y last_read_at', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const res = await api('/api/chat/list', student.token)
    expect(res.status).toBe(200)
    const { chats } = await res.json()
    expect(chats.length).toBeGreaterThan(0)
    const chat = chats[0]
    // Sin estos dos campos, la lista de mobile pinta un ícono genérico con el
    // título de la clase y deja el punto de no-leído encendido para siempre.
    expect(Array.isArray(chat.participants)).toBe(true)
    expect(chat.participants.length).toBe(2)
    expect('last_read_at' in chat).toBe(true)
  })

  test('un profesor no puede abrir chat con alguien que no está inscrito', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const classId = await ins('classes', { ...classBase(teacher.id), title: '[QA] chat forzado', date: '2027-04-03', price: 10000 })
    await ins('enrollments', { class_id: classId, student_id: student.id, status: 'confirmed' })

    const bad = await api('/api/chat/get-or-create', teacher.token, {
      method: 'POST',
      body: JSON.stringify({ type: 'class', class_id: classId, student_id: outsider.id }),
    })
    expect(bad.status).toBe(403)

    const ok = await api('/api/chat/get-or-create', teacher.token, {
      method: 'POST',
      body: JSON.stringify({ type: 'class', class_id: classId, student_id: student.id }),
    })
    expect(ok.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PAQUETES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Paquetes', () => {
  test('confirmar registra los pagos, emite el QR y suma exactamente el precio', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const c1 = await ins('classes', { ...classBase(teacher.id), title: '[QA] pack A', date: '2027-05-01', price: 12000 })
    const c2 = await ins('classes', { ...classBase(teacher.id), title: '[QA] pack B', date: '2027-05-02', price: 12000 })
    const pkgId = await ins('class_packages', { teacher_id: teacher.id, title: '[QA] paquete', price: 19999 })
    await admin.from('class_package_items').insert([
      { package_id: pkgId, class_id: c1 },
      { package_id: pkgId, class_id: c2 },
    ])
    const e1 = await ins('enrollments', { class_id: c1, student_id: student.id, status: 'payment_submitted' })
    const e2 = await ins('enrollments', { class_id: c2, student_id: student.id, status: 'payment_submitted' })
    const peId = await ins('package_enrollments', {
      package_id: pkgId, student_id: student.id, status: 'payment_submitted',
      amount: 19999, receipt_url: `${student.id}/pkg_qa.jpg`,
    })

    const res = await api(`/api/packages/${pkgId}/confirm`, teacher.token, {
      method: 'POST',
      body: JSON.stringify({ package_enrollment_id: peId, action: 'confirm' }),
    })
    expect(res.status).toBe(200)

    const { data: enrollments } = await admin.from('enrollments').select('id, status').in('id', [e1, e2])
    expect(enrollments!.every((e: any) => e.status === 'confirmed')).toBe(true)

    // El ingreso del paquete era invisible: no se creaba ninguna fila de pago.
    const { data: payments } = await admin
      .from('payments').select('amount, status, recipient_teacher_id, receipt_url').in('enrollment_id', [e1, e2])
    expect(payments).toHaveLength(2)
    expect(payments!.every((p: any) => p.status === 'verified')).toBe(true)
    expect(payments!.every((p: any) => p.recipient_teacher_id === teacher.id)).toBe(true)
    expect(payments!.reduce((acc: number, p: any) => acc + p.amount, 0)).toBe(19999)
    expect(payments!.every((p: any) => p.receipt_url === `${student.id}/pkg_qa.jpg`)).toBe(true)

    // Y el alumno quedaba `confirmed` SIN token QR: el escáner lo rechazaba.
    const { data: tokens } = await admin.from('qr_tokens').select('enrollment_id, revoked_at').in('enrollment_id', [e1, e2])
    expect(tokens).toHaveLength(2)
    expect(tokens!.every((t: any) => !t.revoked_at)).toBe(true)

    // Un solo aviso, no uno por clase del paquete.
    const { data: notifs } = await admin
      .from('notifications').select('id').eq('user_id', student.id).eq('type', 'payment_confirmed')
    expect(notifs).toHaveLength(1)
  })

  test('rechazar devuelve las inscripciones de clase a pendiente de pago', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const other = await mkUser('qapack')
    const c1 = await ins('classes', { ...classBase(teacher.id), title: '[QA] pack C', date: '2027-05-03', price: 8000 })
    const c2 = await ins('classes', { ...classBase(teacher.id), title: '[QA] pack D', date: '2027-05-04', price: 8000 })
    const pkgId = await ins('class_packages', { teacher_id: teacher.id, title: '[QA] paquete 2', price: 14000 })
    await admin.from('class_package_items').insert([
      { package_id: pkgId, class_id: c1 },
      { package_id: pkgId, class_id: c2 },
    ])
    const e1 = await ins('enrollments', { class_id: c1, student_id: other.id, status: 'payment_submitted' })
    const e2 = await ins('enrollments', { class_id: c2, student_id: other.id, status: 'payment_submitted' })
    const peId = await ins('package_enrollments', {
      package_id: pkgId, student_id: other.id, status: 'payment_submitted', amount: 14000,
    })

    const res = await api(`/api/packages/${pkgId}/confirm`, teacher.token, {
      method: 'POST',
      body: JSON.stringify({ package_enrollment_id: peId, action: 'reject' }),
    })
    expect(res.status).toBe(200)

    const { data: enrollments } = await admin.from('enrollments').select('id, status').in('id', [e1, e2])
    expect(enrollments!.every((e: any) => e.status === 'pending_payment')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Eventos', () => {
  test('el comprobante es privado y sólo alumno y organizador obtienen su URL', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const eventId = await ins('events', {
      creator_id: teacher.id, title: '[QA] evento con entrada', event_type: 'batalla',
      event_date: '2027-06-01', city: 'Santiago', has_entry: true, entry_price: 5000, status: 'active',
    })
    const enrollmentId = await ins('event_enrollments', { event_id: eventId, user_id: student.id, status: 'payment_submitted' })
    const path = `${student.id}/event_${eventId}_qa.jpg`
    await admin.storage.from('payment-receipts').upload(path, Buffer.from([0xff, 0xd8, 0xff, 0x00]), {
      contentType: 'image/jpeg', upsert: true,
    })
    const payId = await ins('event_payments', {
      enrollment_id: enrollmentId, event_id: eventId, user_id: student.id,
      amount: 5000, receipt_url: path, status: 'submitted',
    })

    // El bucket es privado (029): sin firma no se sirve.
    const raw = await fetch(`${URL}/storage/v1/object/public/payment-receipts/${path}`)
    expect(raw.ok).toBe(false)

    for (const who of [teacher, student]) {
      const res = await api(`/api/payment/receipt-url?eventPaymentId=${payId}`, who.token)
      expect(res.status).toBe(200)
      const { url } = await res.json()
      const signed = await fetch(url)
      expect(signed.ok).toBe(true)
    }

    const forbidden = await api(`/api/payment/receipt-url?eventPaymentId=${payId}`, outsider.token)
    expect(forbidden.status).toBe(403)
  })

  test('confirmar y rechazar el pago pasan por la ruta y avisan al alumno', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const buyer = await mkUser('qaevento')
    const eventId = await ins('events', {
      creator_id: teacher.id, title: '[QA] evento confirmable', event_type: 'masterclass',
      event_date: '2027-06-02', city: 'Santiago', has_entry: true, entry_price: 7000, status: 'active',
    })
    const enrollmentId = await ins('event_enrollments', { event_id: eventId, user_id: buyer.id, status: 'payment_submitted' })
    await ins('event_payments', {
      enrollment_id: enrollmentId, event_id: eventId, user_id: buyer.id,
      amount: 7000, receipt_url: `${buyer.id}/event_x.jpg`, status: 'submitted',
    })

    // Un tercero no puede decidir sobre el evento de otro.
    const forbidden = await api('/api/event/confirm-payment', outsider.token, {
      method: 'POST', body: JSON.stringify({ enrollment_id: enrollmentId, action: 'confirm' }),
    })
    expect(forbidden.status).toBe(403)

    const ok = await api('/api/event/confirm-payment', teacher.token, {
      method: 'POST', body: JSON.stringify({ enrollment_id: enrollmentId, action: 'confirm' }),
    })
    expect(ok.status).toBe(200)

    const { data: confirmed } = await admin.from('event_enrollments').select('status').eq('id', enrollmentId).single()
    expect(confirmed.status).toBe('confirmed')
    const { data: paid } = await admin.from('event_payments').select('status').eq('enrollment_id', enrollmentId).single()
    expect(paid.status).toBe('verified')

    // El alumno no se enteraba de nada: el organizador confirmaba con dos
    // UPDATE sueltos desde el navegador.
    const { data: notif } = await admin
      .from('notifications').select('type, data').eq('user_id', buyer.id).eq('type', 'payment_confirmed').single()
    expect(notif.data.event_id).toBe(eventId)

    const rejected = await api('/api/event/confirm-payment', teacher.token, {
      method: 'POST', body: JSON.stringify({ enrollment_id: enrollmentId, action: 'reject' }),
    })
    expect(rejected.status).toBe(200)
    const { data: back } = await admin.from('event_enrollments').select('status').eq('id', enrollmentId).single()
    expect(back.status).toBe('pending_payment')
    // 'void' y no 'rejected': el CHECK de 038 no admite ese valor, y la pantalla
    // del alumno vuelve a ofrecerle subir un comprobante nuevo.
    const { data: voided } = await admin.from('event_payments').select('status').eq('enrollment_id', enrollmentId).single()
    expect(voided.status).toBe('void')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENSAYOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Ensayos', () => {
  test('sólo creador e invitados ven el ensayo, y responder avisa al creador', async () => {
    test.skip(!serverUp, 'requiere npm run dev:web')
    const rehearsalId = await ins('rehearsals', {
      creator_id: teacher.id, title: '[QA] ensayo', city: 'Santiago',
      date_mode: 'single', rehearsal_date: '2027-07-01', rehearsal_time: '19:00', status: 'active',
    })
    const inviteId = await ins('rehearsal_invites', { rehearsal_id: rehearsalId, user_id: student.id, status: 'pending' })

    const { data: hidden } = await outsider.client.from('rehearsals').select('id').eq('id', rehearsalId)
    expect(hidden ?? []).toHaveLength(0)
    const { data: visible } = await student.client.from('rehearsals').select('id').eq('id', rehearsalId)
    expect(visible ?? []).toHaveLength(1)

    const res = await api('/api/rehearsal/respond', student.token, {
      method: 'POST', body: JSON.stringify({ invite_id: inviteId, status: 'accepted' }),
    })
    expect(res.status).toBe(200)

    const { data: invite } = await admin.from('rehearsal_invites').select('status').eq('id', inviteId).single()
    expect(invite.status).toBe('accepted')

    const { data: notif } = await admin
      .from('notifications').select('data').eq('user_id', teacher.id).eq('type', 'rehearsal_accepted').single()
    expect(notif.data.rehearsal_id).toBe(rehearsalId)

    // El chat grupal se crea recién cuando alguien lo abre, y sólo para
    // participantes reales.
    const denied = await api('/api/chat/get-or-create', outsider.token, {
      method: 'POST', body: JSON.stringify({ type: 'rehearsal', rehearsal_id: rehearsalId }),
    })
    expect(denied.status).toBe(403)

    const chat = await api('/api/chat/get-or-create', student.token, {
      method: 'POST', body: JSON.stringify({ type: 'rehearsal', rehearsal_id: rehearsalId }),
    })
    expect(chat.status).toBe(200)
  })
})
