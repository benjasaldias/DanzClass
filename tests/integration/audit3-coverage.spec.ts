/**
 * Integración (stack local Docker) — features que llegaron al lanzamiento sin
 * ninguna cobertura automatizada (audit3.md, §"Cobertura de tests").
 *
 * `audit.md` S7 dejó suites para Chat, Paquetes, Eventos y Ensayos. Estas cuatro
 * quedaron afuera y son justamente las que mueven reputación, dinero y acceso:
 *
 *   Lista de espera — al liberarse un cupo se avisa al primero de la fila.
 *   Valoraciones    — la elegibilidad (inscripción confirmada + clase ya
 *                     ocurrida) vive SOLO en la ruta desde que `065` cerró
 *                     `ratings` al cliente: si la ruta se relaja, nada más lo
 *                     detiene.
 *   Descuentos      — el precio con descuento es autoritativo server-side.
 *   Referidos       — el premio (+30 días Pro a ambos) exige suscripción PAGADA
 *                     y no se paga a sí mismo.
 *
 * Todos los `test.fixme` que documentaban hallazgos abiertos de `audit3.md`
 * (P0-1, P0-2, P1-1, P1-4) ya se convirtieron en tests reales al cerrarse
 * cada hallazgo — mismo patrón que usó `rls-guards.spec.ts` con audit/audit2.
 * Si aparece un `test.fixme` nuevo más abajo, describe el comportamiento
 * CORRECTO esperado de un hallazgo todavía sin arreglar, no el actual.
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

type User = { id: string; email: string; token: string; refresh: string; client: any }

async function mkUser(prefix: string): Promise<User> {
  const email = `${prefix}-${stamp}@a3test.local`
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
  return {
    id: data.user.id,
    email,
    token: session.session.access_token,
    refresh: session.session.refresh_token,
    client,
  }
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

async function givePlan(userId: string, tier = 'pro') {
  await admin.from('subscriptions').insert({
    user_id: userId,
    tier,
    status: 'active',
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    mp_subscription_id: `mp_a3_${userId.slice(0, 8)}_${stamp}`,
  })
}

const classBase = (teacherId: string) => ({
  teacher_id: teacherId,
  dance_style: 'House',
  level: 'principiante',
  type: 'suelta',
  time: '20:00',
  duration_minutes: 60,
  city: 'Santiago',
  status: 'active',
  accepts_transfer: true,
  accepts_mp: false,
})

let teacher: User
let student: User
let outsider: User

test.beforeAll(async () => {
  teacher = await mkUser('a3prof')
  student = await mkUser('a3alu')
  outsider = await mkUser('a3otro')
  await givePlan(teacher.id)
  await givePlan(student.id)
  await givePlan(outsider.id)

  try {
    const res = await fetch(`${APP}/api/chat/list`, { headers: { Authorization: 'Bearer nope' } })
    serverUp = res.status !== 0
  } catch {
    serverUp = false
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE ESPERA
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Lista de espera', () => {
  test('al liberarse el cupo se avisa al primero de la fila', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] waitlist aviso',
      date: '2027-05-01',
      price: 10000,
      max_spots: 1,
    })

    const holder = await mkUser('a3hold')
    await givePlan(holder.id)
    const enrolled = await api('/api/class/enroll', holder.token, {
      method: 'POST',
      body: JSON.stringify({ classId }),
    })
    expect(enrolled.status).toBe(200)
    const enrollmentId = (await enrolled.json()).enrollment.id

    // La clase quedó llena: el alumno de la lista se anota.
    const joined = await api('/api/class/waitlist/join', student.token, {
      method: 'POST',
      body: JSON.stringify({ classId }),
    })
    expect(joined.status).toBe(200)

    // Nadie más puede reservar mientras esté llena.
    const full = await api('/api/class/enroll', outsider.token, {
      method: 'POST',
      body: JSON.stringify({ classId }),
    })
    expect(full.status).toBe(409)
    expect((await full.json()).error).toBe('no_spots')

    // Se libera el cupo → el primero de la fila recibe `waitlist_available`.
    const left = await api('/api/class/leave', holder.token, {
      method: 'POST',
      body: JSON.stringify({ enrollmentId }),
    })
    expect(left.status).toBe(200)

    const { data: notif } = await admin
      .from('notifications')
      .select('id, data')
      .eq('user_id', student.id)
      .eq('type', 'waitlist_available')
      .maybeSingle()
    expect(notif, 'el primero de la lista debe recibir el aviso').toBeTruthy()
    expect(notif.data.class_id).toBe(classId)
  })

  test('P1-4: el segundo aviso llega al SIGUIENTE de la fila, no al mismo de siempre', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(60_000)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] waitlist siguiente',
      date: '2027-05-08',
      price: 10000,
      max_spots: 1,
    })

    const holder1 = await mkUser('a3w1h')
    await givePlan(holder1.id)
    const w1 = await mkUser('a3w1')
    const w2 = await mkUser('a3w2')

    const e1 = await api('/api/class/enroll', holder1.token, {
      method: 'POST', body: JSON.stringify({ classId }),
    })
    expect(e1.status).toBe(200)
    const holder1EnrollmentId = (await e1.json()).enrollment.id

    expect((await api('/api/class/waitlist/join', w1.token, {
      method: 'POST', body: JSON.stringify({ classId }),
    })).status).toBe(200)
    expect((await api('/api/class/waitlist/join', w2.token, {
      method: 'POST', body: JSON.stringify({ classId }),
    })).status).toBe(200)

    // Se libera el cupo → w1 (primero de la fila) recibe el aviso.
    expect((await api('/api/class/leave', holder1.token, {
      method: 'POST', body: JSON.stringify({ enrollmentId: holder1EnrollmentId }),
    })).status).toBe(200)

    // w1 toma el cupo. Su fila en `waitlist` debe desaparecer al inscribirse —
    // si no, la próxima liberación lo vuelve a avisar a él y w2 nunca se entera.
    const w1Enroll = await api('/api/class/enroll', w1.token, {
      method: 'POST', body: JSON.stringify({ classId }),
    })
    expect(w1Enroll.status).toBe(200)
    const w1EnrollmentId = (await w1Enroll.json()).enrollment.id

    const { data: afterW1Enroll } = await admin
      .from('waitlist').select('user_id').eq('class_id', classId)
    expect(
      (afterW1Enroll ?? []).map((r: any) => r.user_id),
      'w1 debe salir de la fila al inscribirse'
    ).toEqual([w2.id])

    // w1 se va de nuevo → el aviso ahora tiene que ser para w2, no otra vez w1.
    expect((await api('/api/class/leave', w1.token, {
      method: 'POST', body: JSON.stringify({ enrollmentId: w1EnrollmentId }),
    })).status).toBe(200)

    const { data: notifW1 } = await admin
      .from('notifications').select('id').eq('user_id', w1.id).eq('type', 'waitlist_available')
    expect(notifW1 ?? [], 'w1 sólo debe recibir UN aviso, no uno por cada liberación').toHaveLength(1)

    const { data: notifW2 } = await admin
      .from('notifications').select('id, data').eq('user_id', w2.id).eq('type', 'waitlist_available')
    expect(notifW2 ?? [], 'w2 debe recibir su propio aviso').toHaveLength(1)
    expect((notifW2 as any[])[0].data.class_id).toBe(classId)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// VALORACIONES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Valoraciones', () => {
  test('la elegibilidad se hace cumplir en la ruta (única puerta desde 065)', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(90_000)

    // Sin ninguna inscripción con ese profesor → 403.
    const noEnrollment = await api('/api/ratings/upsert', outsider.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: teacher.id, stars: 5 }),
    })
    expect(noEnrollment.status).toBe(403)

    // Inscripción confirmada pero la clase todavía NO ocurrió → 403.
    const future = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] rating futura',
      date: '2027-06-01',
      price: 10000,
      max_spots: 10,
    })
    await ins('enrollments', { class_id: future, student_id: student.id, status: 'confirmed' })
    const tooEarly = await api('/api/ratings/upsert', student.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: teacher.id, stars: 5 }),
    })
    expect(tooEarly.status).toBe(403)

    // Con una clase ya ocurrida → se acepta y devuelve el promedio.
    const past = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] rating pasada',
      date: '2020-01-05',
      price: 10000,
      max_spots: 10,
    })
    await ins('enrollments', { class_id: past, student_id: student.id, status: 'confirmed' })
    const ok = await api('/api/ratings/upsert', student.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: teacher.id, stars: 4 }),
    })
    expect(ok.status).toBe(200)
    expect((await ok.json()).ratingCount).toBeGreaterThan(0)

    // Auto-valoración → 400, incluso cumpliendo lo demás.
    const self = await api('/api/ratings/upsert', student.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: student.id, stars: 5 }),
    })
    expect(self.status).toBe(400)

    // P2-6: la tabla exige pasos de 0.5 — un decimal fuera de esos pasos
    // pasaba la validación de la ruta y moría en la base con un 500 genérico.
    const badStep = await api('/api/ratings/upsert', student.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: teacher.id, stars: 3.7 }),
    })
    expect(badStep.status, 'un decimal fuera de pasos de 0.5 debe rechazarse en la ruta, no en la base').toBe(400)

    // Y el paso de 0.5 sí es válido (mitad legítima del fix).
    const halfStep = await api('/api/ratings/upsert', student.token, {
      method: 'POST',
      body: JSON.stringify({ rated_user_id: teacher.id, stars: 3.5 }),
    })
    expect(halfStep.status).toBe(200)
  })

  test('el cliente no puede escribir `ratings` directo (065 cerró la tabla)', async () => {
    const { error } = await student.client
      .from('ratings')
      .insert({ rater_id: student.id, rated_user_id: outsider.id, stars: 5 })
    expect(error, 'la policy de INSERT se eliminó en 065: debe rechazar').toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DESCUENTOS ESPONTÁNEOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Descuentos', () => {
  test('el precio con descuento se valida server-side y solo lo fija el dueño', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    // El limitador `discount` es 3 por 30 min por (usuario, clase): cada caso
    // usa su propia clase para no chocar con él.
    test.setTimeout(90_000)

    const mkClass = (title: string) =>
      ins('classes', { ...classBase(teacher.id), title, date: '2027-07-01', price: 10000, max_spots: 10 })

    // Alguien que no es el profesor de la clase.
    const foreign = await mkClass('[A3] descuento ajeno')
    const notMine = await api('/api/class/discount', outsider.token, {
      method: 'POST',
      body: JSON.stringify({ class_id: foreign, discount_price: 5000 }),
    })
    expect(notMine.status).toBe(404)

    // Precio negativo, decimal, o mayor/igual al original.
    for (const bad of [-1, 1.5, 10000]) {
      const classId = await mkClass(`[A3] descuento ${bad}`)
      const res = await api('/api/class/discount', teacher.token, {
        method: 'POST',
        body: JSON.stringify({ class_id: classId, discount_price: bad }),
      })
      expect(res.status, `descuento inválido ${bad} debe rechazarse`).toBe(400)
      const { data: untouched } = await admin
        .from('classes').select('discount_price').eq('id', classId).single()
      expect(untouched.discount_price, 'un descuento inválido no debe persistirse').toBeNull()
    }

    const okClass = await mkClass('[A3] descuento válido')
    const ok = await api('/api/class/discount', teacher.token, {
      method: 'POST',
      body: JSON.stringify({ class_id: okClass, discount_price: 6000 }),
    })
    expect(ok.status).toBe(200)
    const { data: after } = await admin.from('classes').select('discount_price').eq('id', okClass).single()
    expect(after.discount_price).toBe(6000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REFERIDOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Referidos', () => {
  test('el premio exige una suscripción pagada real y no se paga a sí mismo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rewardReferralIfNeeded } = require(`${ROOT}/apps/web/src/lib/referral.ts`)

    // (1) auto-referido: aunque tenga suscripción pagada, no se premia.
    const selfRef = await mkUser('a3self')
    await givePlan(selfRef.id)
    await admin.from('profiles').update({ referred_by: selfRef.id, referral_rewarded: false }).eq('id', selfRef.id)
    await rewardReferralIfNeeded(admin, selfRef.id)
    let { data: p } = await admin.from('profiles').select('referral_rewarded').eq('id', selfRef.id).single()
    expect(p.referral_rewarded, 'un auto-referido no puede reclamar el premio').toBe(false)

    // (2) referido SIN suscripción pagada (solo un mes de regalo `referral_`):
    //     tampoco se premia, o el premio se auto-alimentaría.
    const referrer = await mkUser('a3ref')
    const gifted = await mkUser('a3gift')
    await admin.from('subscriptions').insert({
      user_id: gifted.id,
      tier: 'pro',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      mp_subscription_id: `referral_${referrer.id.slice(0, 8)}_${stamp}`,
    })
    await admin.from('profiles').update({ referred_by: referrer.id, referral_rewarded: false }).eq('id', gifted.id)
    await rewardReferralIfNeeded(admin, gifted.id)
    ;({ data: p } = await admin.from('profiles').select('referral_rewarded').eq('id', gifted.id).single())
    expect(p.referral_rewarded, 'una suscripción de regalo no habilita el premio').toBe(false)

    // (3) referido con suscripción pagada: se premia UNA vez (idempotente).
    const paid = await mkUser('a3paid')
    await givePlan(paid.id)
    await givePlan(referrer.id)
    await admin.from('profiles').update({ referred_by: referrer.id, referral_rewarded: false }).eq('id', paid.id)
    const { data: before } = await admin
      .from('subscriptions').select('expires_at').eq('user_id', referrer.id).single()
    await rewardReferralIfNeeded(admin, paid.id)
    await rewardReferralIfNeeded(admin, paid.id) // segunda llamada: no-op
    ;({ data: p } = await admin.from('profiles').select('referral_rewarded').eq('id', paid.id).single())
    expect(p.referral_rewarded).toBe(true)
    const { data: afterSub } = await admin
      .from('subscriptions').select('expires_at').eq('user_id', referrer.id).single()
    const days = (new Date(afterSub.expires_at).getTime() - new Date(before.expires_at).getTime()) / 864e5
    expect(Math.round(days), 'el referidor gana 30 días, una sola vez').toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HALLAZGOS DE audit3.md — P0-1 y P0-2, cerrados en la sesión 1 de audit3
// ─────────────────────────────────────────────────────────────────────────────

// El ataque de P0-1: registrar un pago con un comprobante que nunca se subió.
// La ruta validaba el PREFIJO del path (`<userId>/…`) pero no que el objeto
// existiera, así que el pago pasaba a 'pending' sin que hubiera nada que
// revisar — en un entrenamiento eso saca la deuda de "vencida" y devuelve el
// QR, y en una clase con hold borra `hold_expires_at` y el cupo queda tomado.
//
// Se prueban las DOS mitades: el path inventado debe rechazarse Y el
// comprobante real debe seguir registrándose (si sólo se probara el ataque, un
// fix que rompiera la subida legítima pasaría el test).
test.describe('audit3 P0-1 · comprobante inexistente', () => {
  const RECEIPT_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

  async function uploadReceipt(userId: string, name: string): Promise<string> {
    const path = `${userId}/${name}`
    const { error } = await admin.storage
      .from('payment-receipts')
      .upload(path, RECEIPT_BYTES, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    return path
  }

  test('un cargo mensual de entrenamiento no pasa a revisión con un path inventado', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(90_000)

    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
    twoMonthsAgo.setDate(1)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] entrenamiento comprobante fantasma',
      type: 'entrenamiento',
      recurrence: 'weekly',
      day_of_week: 1,
      recurring_time: '20:00',
      start_date: twoMonthsAgo.toISOString().slice(0, 10),
      ends_indefinitely: true,
      billing_day: 1,
      price: 20000,
      max_spots: 20,
      time: null,
    })
    const enrollmentId = await ins('enrollments', {
      class_id: classId,
      student_id: student.id,
      status: 'confirmed',
    })
    await admin.rpc('generate_monthly_charges', { p_enrollment_id: enrollmentId })

    const readCharges = async () => {
      const { data } = await admin
        .from('payments')
        .select('id, billing_period, status')
        .eq('enrollment_id', enrollmentId)
        .not('billing_period', 'is', null)
        .order('billing_period', { ascending: true })
      return (data ?? []) as any[]
    }

    const before = await readCharges()
    expect(before.length, 'el entrenamiento debe tener cargos emitidos').toBeGreaterThan(0)
    expect(before.every((c) => c.status === 'due')).toBe(true)

    // Ataque: path bajo la propia carpeta del alumno, pero sin archivo detrás.
    const ghost = await api('/api/payment/submit-transfer', student.token, {
      method: 'POST',
      body: JSON.stringify({
        enrollmentId,
        receiptPath: `${student.id}/fantasma-${stamp}.jpg`,
        chargeIds: before.map((c) => c.id),
      }),
    })
    expect(ghost.status, 'un comprobante inexistente no puede registrarse').toBe(400)
    expect((await ghost.json()).error).toBe('receipt_not_found')

    const afterGhost = await readCharges()
    expect(
      afterGhost.every((c) => c.status === 'due'),
      'ningún cargo puede salir de la deuda por una request sin archivo'
    ).toBe(true)

    // Mitad legítima: con el archivo realmente subido, el registro funciona.
    const realPath = await uploadReceipt(student.id, `real-${stamp}.jpg`)
    const real = await api('/api/payment/submit-transfer', student.token, {
      method: 'POST',
      body: JSON.stringify({ enrollmentId, receiptPath: realPath, chargeIds: [before[0].id] }),
    })
    expect(real.status, 'un comprobante real debe seguir registrándose').toBe(200)
    const afterReal = await readCharges()
    expect(afterReal.find((c) => c.id === before[0].id).status).toBe('pending')
  })

  test('una reserva con hold no se concreta con un path inventado', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(90_000)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] hold comprobante fantasma',
      date: '2027-08-01',
      price: 10000,
      max_spots: 1,
      allow_late_payment: false,
    })

    const buyer = await mkUser('a3hold2')
    const enrolled = await api('/api/class/enroll', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ classId }),
    })
    expect(enrolled.status).toBe(200)
    const enrollmentId = (await enrolled.json()).enrollment.id

    const ghost = await api('/api/payment/submit-transfer', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ enrollmentId, receiptPath: `${buyer.id}/fantasma-${stamp}.jpg` }),
    })
    expect(ghost.status).toBe(400)
    expect((await ghost.json()).error).toBe('receipt_not_found')

    const { data: enr } = await (admin as any)
      .from('enrollments')
      .select('status, hold_expires_at')
      .eq('id', enrollmentId)
      .single()
    expect(enr.status, 'la reserva no puede concretarse sin comprobante').toBe('pending_payment')
    expect(enr.hold_expires_at, 'el hold no puede borrarse: el cupo tiene que poder liberarse').toBeTruthy()

    const { data: pay } = await (admin as any)
      .from('payments').select('id').eq('enrollment_id', enrollmentId)
    expect(pay ?? [], 'no puede quedar una fila de pago por un comprobante que no existe').toHaveLength(0)
  })
})

// El ataque de P0-2: entrar a una clase por la puerta lateral del 2x. `match`
// creaba las dos inscripciones sin repetir ninguna de las validaciones de
// `/api/class/enroll` (audición, clase vencida, clase cancelada, vía de pago).
test.describe('audit3 P0-2 · el match 2x valida como enroll', () => {
  test('un entrenamiento con audición obligatoria rechaza el match', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(90_000)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] 2x salta audición',
      type: 'entrenamiento',
      recurrence: 'weekly',
      day_of_week: 2,
      recurring_time: '21:00',
      start_date: '2027-09-06',
      ends_indefinitely: true,
      billing_day: 1,
      requires_audition: true,
      price: 20000,
      price_2x: 30000,
      max_spots: 20,
      time: null,
    })

    const a = await mkUser('a32xa')
    const b = await mkUser('a32xb')

    // Sin audición, `enroll` ya rechaza. El match tiene que rechazar igual.
    const direct = await api('/api/class/enroll', a.token, {
      method: 'POST',
      body: JSON.stringify({ classId }),
    })
    expect(direct.status).toBe(403)
    expect((await direct.json()).error).toBe('audition_required')

    const requestId = await ins('class_2x_requests', {
      user_id: a.id,
      class_id: classId,
      status: 'looking',
    })
    const matched = await api('/api/class-2x/match', b.token, {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    })
    expect(matched.status, 'el 2x no puede saltarse la audición').toBe(403)
    expect((await matched.json()).error).toBe('audition_required')

    const { data: enrollments } = await admin
      .from('enrollments').select('id').eq('class_id', classId)
    expect(enrollments ?? [], 'nadie queda inscrito en el entrenamiento').toHaveLength(0)
  })

  test('una clase cancelada y vencida rechaza el match', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(60_000)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] 2x clase cancelada',
      date: '2020-03-01',
      price: 10000,
      price_2x: 16000,
      max_spots: 10,
      status: 'cancelled',
    })

    const a = await mkUser('a32xc')
    const b = await mkUser('a32xd')
    const requestId = await ins('class_2x_requests', { user_id: a.id, class_id: classId, status: 'looking' })

    const matched = await api('/api/class-2x/match', b.token, {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    })
    expect(matched.status, 'una clase cancelada no admite inscripciones').toBe(404)

    const { data: enrollments } = await admin
      .from('enrollments').select('id').eq('class_id', classId)
    expect(enrollments ?? []).toHaveLength(0)
  })

  test('el match legítimo sigue funcionando y deja el turno de pago en el solicitante', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    test.setTimeout(60_000)

    const classId = await ins('classes', {
      ...classBase(teacher.id),
      title: '[A3] 2x legítimo',
      date: '2027-10-01',
      price: 10000,
      price_2x: 16000,
      max_spots: 10,
    })

    const a = await mkUser('a32xe')
    const b = await mkUser('a32xf')
    const requestId = await ins('class_2x_requests', { user_id: a.id, class_id: classId, status: 'looking' })

    const matched = await api('/api/class-2x/match', b.token, {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    })
    expect(matched.status).toBe(200)

    const { data: enrollments } = await (admin as any)
      .from('enrollments').select('student_id, status, is_2x, partner_enrollment_id').eq('class_id', classId)
    expect(enrollments).toHaveLength(2)
    expect(enrollments.every((e: any) => e.is_2x && e.status === 'pending_payment')).toBe(true)
    expect(enrollments.every((e: any) => !!e.partner_enrollment_id)).toBe(true)

    const { data: req } = await (admin as any)
      .from('class_2x_requests').select('status, matched_with, payment_assignee').eq('id', requestId).single()
    expect(req.status).toBe('matched')
    expect(req.matched_with).toBe(b.id)
    expect(req.payment_assignee).toBe(a.id)

    // La misma solicitud no se puede volver a matchear.
    const again = await api('/api/class-2x/match', outsider.token, {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    })
    expect(again.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CUPO DE PUBLICACIÓN POR PLAN (audit3 P1-1)
//
// El tope del plan Básico vivía SOLO en el formulario web (`sueltas_this_month`):
// mobile no lo aplicaba y un INSERT directo por PostgREST —que es exactamente lo
// que hacen las dos apps— tampoco. Se cierra en la base, con el patrón de los
// triggers de `060` para el cupo de videos, porque `classes` se inserta desde el
// cliente y cualquier chequeo en React es cosmético.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cupo de publicación por plan', () => {
  const periodicaRow = (teacherId: string, title: string) => ({
    ...classBase(teacherId),
    type: 'periodica',
    title,
    recurrence: 'custom',
    custom_dates: ['2027-11-03', '2027-11-10'],
    start_date: '2027-11-03',
    ends_at: '2027-11-10',
    day_of_week: 2,
    recurring_time: '20:00',
    price: 20000,
    max_spots: 10,
  })

  const entrenamientoRow = (teacherId: string, title: string) => ({
    ...classBase(teacherId),
    type: 'entrenamiento',
    title,
    recurrence: 'weekly',
    start_date: '2027-11-03',
    ends_indefinitely: true,
    day_of_week: 2,
    recurring_time: '20:00',
    price: 20000,
    billing_day: 5,
    max_spots: 10,
  })

  test('el plan Básico publica 1 suelta al mes y ninguna periódica ni entrenamiento', async () => {
    const basic = await mkUser('a3bas')
    await givePlan(basic.id, 'basic')

    // La primera suelta del mes es su derecho: tiene que entrar.
    const first = await basic.client.from('classes').insert({
      ...classBase(basic.id),
      title: '[A3] básica #1',
      date: '2027-09-01',
      price: 10000,
      max_spots: 10,
    })
    expect(first.error, 'la primera suelta del mes debe aceptarse').toBeNull()

    // La segunda del mismo mes, no.
    const second = await basic.client.from('classes').insert({
      ...classBase(basic.id),
      title: '[A3] básica #2',
      date: '2027-09-08',
      price: 10000,
      max_spots: 10,
    })
    expect(second.error, 'la segunda suelta del mes debe rechazarse').toBeTruthy()
    expect(second.error.message).toContain('class_quota_exceeded')

    // Ni periódicas ni entrenamientos, que son del plan Pro.
    const periodica = await basic.client.from('classes').insert(periodicaRow(basic.id, '[A3] básica periódica'))
    expect(periodica.error, 'una periódica no es del plan Básico').toBeTruthy()
    expect(periodica.error.message).toContain('class_type_requires_pro')

    const entrenamiento = await basic.client.from('classes').insert(entrenamientoRow(basic.id, '[A3] básica entrenamiento'))
    expect(entrenamiento.error, 'un entrenamiento no es del plan Básico').toBeTruthy()
    expect(entrenamiento.error.message).toContain('class_type_requires_pro')

    const { count } = await admin
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', basic.id)
    expect(count, 'sólo debe haber quedado la primera clase').toBe(1)
  })

  test('el plan Pro publica sin tope y de cualquier tipo', async () => {
    const pro = await mkUser('a3pro')
    await givePlan(pro.id, 'pro')

    for (const n of [1, 2, 3]) {
      const { error } = await pro.client.from('classes').insert({
        ...classBase(pro.id),
        title: `[A3] pro suelta #${n}`,
        date: '2027-09-15',
        price: 10000,
        max_spots: 10,
      })
      expect(error, `la suelta #${n} de un Pro debe aceptarse`).toBeNull()
    }

    const periodica = await pro.client.from('classes').insert(periodicaRow(pro.id, '[A3] pro periódica'))
    expect(periodica.error, 'un Pro sí publica periódicas').toBeNull()

    const entrenamiento = await pro.client.from('classes').insert(entrenamientoRow(pro.id, '[A3] pro entrenamiento'))
    expect(entrenamiento.error, 'un Pro sí publica entrenamientos').toBeNull()
  })

  test('una suelta publicada no se convierte en periódica, ni cambia de dueño, por UPDATE', async () => {
    const basic = await mkUser('a3edt')
    await givePlan(basic.id, 'basic')

    const { data: cls, error: insErr } = await basic.client.from('classes').insert({
      ...classBase(basic.id),
      title: '[A3] suelta a convertir',
      date: '2027-09-25',
      price: 10000,
      max_spots: 10,
    }).select('id').single()
    expect(insErr).toBeNull()

    // `classes_update_teacher` (001) es FOR UPDATE ... USING sin WITH CHECK: sin
    // la rama de UPDATE del guard, publicar una suelta y convertirla en
    // periódica saltaba el tope entero.
    const converted = await basic.client.from('classes').update({ type: 'periodica' }).eq('id', cls.id)
    expect(converted.error, 'convertir la suelta en periódica sin Pro debe rechazarse').toBeTruthy()
    expect(converted.error.message).toContain('class_type_requires_pro')

    // Y la clase no cambia de dueño (se revierte en silencio).
    await basic.client.from('classes').update({ teacher_id: outsider.id }).eq('id', cls.id)
    const { data: after } = await admin.from('classes').select('teacher_id, type').eq('id', cls.id).single()
    expect(after.teacher_id, 'una clase no se puede reasignar a otra cuenta').toBe(basic.id)
    expect(after.type).toBe('suelta')
  })

  test('sin plan no se publica ninguna clase', async () => {
    const nobody = await mkUser('a3sin')

    const { error } = await nobody.client.from('classes').insert({
      ...classBase(nobody.id),
      title: '[A3] sin plan',
      date: '2027-09-20',
      price: 10000,
      max_spots: 10,
    })
    expect(error, 'sin plan no se publica').toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BORRADO DE CUENTA (audit3 P1-3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Borrado de cuenta', () => {
  test('corta la sesión de verdad, cancela la suscripción en grace y borra los push tokens', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')

    const doomed = await mkUser('a3del')

    // 'grace' es un estado real que `getActiveTier` HONRA: si el borrado no lo
    // cancela, el cobro sigue corriendo con el tier intacto.
    await admin.from('subscriptions').insert({
      user_id: doomed.id,
      tier: 'pro',
      status: 'grace',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      mp_subscription_id: `mp_a3del_${stamp}`,
    })
    await admin.from('push_tokens').insert({
      user_id: doomed.id,
      token: `ExponentPushToken[a3del-${stamp}]`,
      platform: 'android',
    })

    const res = await api('/api/account/delete', doomed.token, { method: 'POST' })
    expect(res.status).toBe(200)

    const { data: subs } = await admin
      .from('subscriptions').select('status').eq('user_id', doomed.id)
    expect(subs.every((s: any) => s.status === 'cancelled'), 'la suscripción en grace debe quedar cancelada').toBe(true)

    const { count: tokens } = await admin
      .from('push_tokens').select('id', { count: 'exact', head: true }).eq('user_id', doomed.id)
    expect(tokens, 'el teléfono no puede seguir recibiendo push de una cuenta borrada').toBe(0)

    // El refresh token del dispositivo es lo que mantiene viva la sesión: si
    // sobrevive, el usuario borrado sigue dentro indefinidamente.
    const fresh = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: renewed } = await fresh.auth.refreshSession({ refresh_token: doomed.refresh })
    expect(renewed?.session, 'el refresh token debe quedar revocado').toBeFalsy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET EMBEBIBLE (audit3 P1-2)
//
// `next.config.js` mandaba `X-Frame-Options: DENY` + `frame-ancestors 'none'`
// a TODO el sitio sin excepción — incluido `/embed/*`, la única ruta que
// EXISTE para ser embebida en un iframe externo. El profesor copiaba el
// código, lo pegaba en su web, y veía un recuadro vacío.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Widget embebible (P1-2)', () => {
  test('/embed/* no manda X-Frame-Options y el resto del sitio sigue con DENY', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')

    const { data: profile } = await admin.from('profiles').select('username').eq('id', teacher.id).single()

    const embedRes = await fetch(`${APP}/embed/teacher/${profile.username}`)
    expect(embedRes.status).toBe(200)
    expect(embedRes.headers.get('x-frame-options'), '/embed/* no debe bloquear el framing').toBeNull()
    expect(embedRes.headers.get('content-security-policy') ?? '').toContain("frame-ancestors *")

    const normalRes = await fetch(`${APP}/feed`)
    expect(normalRes.headers.get('x-frame-options'), 'el resto del sitio debe seguir con DENY').toBe('DENY')
    expect(normalRes.headers.get('content-security-policy') ?? '').toContain("frame-ancestors 'none'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CANCELAR SUSCRIPCIÓN DESDE MOBILE (audit3 P1-5)
//
// `/api/subscriptions/cancel` sólo aceptaba cookie (`createClient()`): mobile
// manda Bearer y recibía 401 siempre, aunque la pantalla de planes prometiera
// "Podés cancelar en cualquier momento". Ahora usa `requireUser`.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cancelar suscripción (P1-5)', () => {
  test('acepta Bearer token (mobile) y cancela la suscripción billable', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')

    const canceller = await mkUser('a3cancel')
    await admin.from('subscriptions').insert({
      user_id: canceller.id,
      tier: 'pro',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      mp_subscription_id: `mp_a3cancel_${stamp}`,
    })

    const res = await api('/api/subscriptions/cancel', canceller.token, { method: 'POST' })
    expect(res.status, 'un Bearer válido ya no debe recibir 401').toBe(200)

    const { data: sub } = await admin
      .from('subscriptions').select('status').eq('user_id', canceller.id).single()
    expect(sub.status).toBe('cancelled')
  })
})
