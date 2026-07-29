/**
 * Integración (stack local Docker) — superficie de escritura RLS (audit.md P0-1).
 *
 * Reproduce, contra PostgREST real y con un JWT de usuario real, los ataques que
 * el audit verificó a mano: un alumno confirmándose la inscripción sin pagar,
 * fabricando pagos `verified`, anulando su hold de cupo, farmeando el premio de
 * referido, falsificando valoraciones, entrando gratis a eventos y forzándole el
 * turno de pago 2x al compañero.
 *
 * La segunda mitad prueba lo contrario: que los caminos LEGÍTIMOS que hoy
 * escriben desde el cliente siguen funcionando (profesor eliminando/confirmando
 * alumnos, alumno cancelando su búsqueda 2x, alumno subiendo comprobante de
 * evento, organizador confirmando). Sin esa mitad, un guard demasiado estricto
 * rompe pantallas en producción sin que nada avise.
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

if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const stamp = Date.now()
const PASSWORD = 'Test1234!'
const ids: Record<string, string> = {}

// Clientes con JWT real: mismo camino que un PATCH desde el navegador.
let S: any // alumno
let T: any // profesor / organizador

async function mkUser(prefix: string): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${stamp}@rlstest.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `${prefix} ${stamp}`, username: `${prefix}${stamp}` },
  })
  if (error) throw error
  return { id: data.user.id, email }
}

async function asUser(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

async function ins(table: string, row: Record<string, any>): Promise<any> {
  const { data, error } = await admin.from(table).insert(row).select('id').single()
  if (error) throw new Error(`seed ${table}: ${error.message}`)
  return data.id
}

test.beforeAll(async () => {
  const teacher = await mkUser('rlsprof')
  const student = await mkUser('rlsalu')
  const partner = await mkUser('rlspar')
  ids.teacher = teacher.id
  ids.student = student.id
  ids.partner = partner.id

  const base = {
    teacher_id: teacher.id, type: 'suelta', dance_style: 'House', time: '20:00',
    duration_minutes: 60, max_spots: 10, city: 'Santiago', status: 'active',
  }
  ids.classId = await ins('classes', { ...base, title: '[TEST] rls guards', date: '2027-03-10', price: 15000, price_2x: 24000 })
  ids.classId2 = await ins('classes', { ...base, title: '[TEST] rls guards 2', date: '2027-03-11', price: 90000 })
  // Clase 3: destino del ataque de "mudar la inscripción". Va aparte de la 2
  // porque el índice único de 056 rechazaría el movimiento si el atacante ya
  // tuviera una inscripción activa ahí — y eso enmascararía el agujero real.
  ids.classId3 = await ins('classes', { ...base, title: '[TEST] rls guards 3', date: '2027-03-12', price: 120000 })

  ids.enrollment = await ins('enrollments', {
    student_id: student.id, class_id: ids.classId, session_id: null,
    status: 'pending_payment', hold_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  // Inscripción aparte para el pago MP: `payments` tiene UNIQUE(enrollment_id).
  ids.partnerEnrollment = await ins('enrollments', {
    student_id: partner.id, class_id: ids.classId, session_id: null, status: 'payment_submitted',
  })
  ids.payment = await ins('payments', {
    enrollment_id: ids.partnerEnrollment, amount: 15000, commission_amount: 300,
    payment_method: 'mp', status: 'verified', recipient_teacher_id: teacher.id,
  })

  ids.event = await ins('events', {
    creator_id: teacher.id, title: '[TEST] rls event', event_type: 'batalla',
    event_date: '2027-04-01', event_time: '18:00', city: 'Santiago', entry_price: 8000, status: 'active',
  })
  ids.eventEnrollment = await ins('event_enrollments', {
    event_id: ids.event, user_id: student.id, status: 'pending_payment',
  })

  ids.package = await ins('class_packages', { teacher_id: teacher.id, title: '[TEST] rls pkg', price: 20000, status: 'active' })
  ids.packageEnrollment = await ins('package_enrollments', {
    package_id: ids.package, student_id: student.id, status: 'pending_payment',
  })

  // Par 2x ya emparejado, con el turno de pago en el alumno. (La variante en la
  // que el atacante es el `matched_with` y no el dueño de la fila ya está
  // cerrada desde 063: su policy de SELECT no le deja ver la fila, y un UPDATE
  // con WHERE necesita poder leerla.)
  ids.request2x = await ins('class_2x_requests', {
    user_id: student.id, class_id: ids.classId, matched_with: partner.id,
    status: 'matched', payment_assignee: student.id,
  })

  S = await asUser(student.email)
  T = await asUser(teacher.email)
})

test('la superficie de escritura RLS rechaza los ataques de P0-1', async () => {
  test.setTimeout(120_000)

  /**
   * Un UPDATE que RLS filtra no devuelve error, solo 0 filas — así que el
   * veredicto no puede salir del error: hay que releer la fila con service role
   * y comparar contra lo que el atacante quería dejar escrito.
   */
  const breaches: string[] = []
  async function attack(
    name: string,
    run: () => Promise<{ error: any }>,
    groundTruth?: () => Promise<boolean>, // true = el ataque SÍ surtió efecto
  ) {
    const { error } = await run()
    const applied = error ? false : groundTruth ? await groundTruth() : true
    if (applied) breaches.push(name)
  }

  const reads = {
    enrollment: (col: string) => admin.from('enrollments').select(col).eq('id', ids.enrollment).single(),
    profile: (col: string) => admin.from('profiles').select(col).eq('id', ids.student).single(),
  }

  // 1. Auto-confirmarse la inscripción sin pagar.
  await attack('enrollments.status → confirmed (alumno)',
    () => S.from('enrollments').update({ status: 'confirmed' }).eq('id', ids.enrollment),
    async () => (await reads.enrollment('status')).data?.status === 'confirmed')

  // 2. Fabricar un pago verificado de $1.
  await attack('payments.insert verified (alumno)',
    () => S.from('payments').insert({
      enrollment_id: ids.enrollment, amount: 1, status: 'verified',
      payment_method: 'transfer', confirmed_by: 'teacher', commission_amount: 0,
    }))

  // 3. Anular el hold de 10 minutos → cupo reservado para siempre.
  await attack('enrollments.hold_expires_at → NULL (alumno)',
    () => S.from('enrollments').update({ hold_expires_at: null }).eq('id', ids.enrollment),
    async () => (await reads.enrollment('hold_expires_at')).data?.hold_expires_at === null)

  // 4. Insertar una inscripción ya confirmada (ni siquiera necesita un UPDATE).
  await attack('enrollments.insert status=confirmed (alumno)',
    () => S.from('enrollments').insert({
      student_id: ids.student, class_id: ids.classId2, session_id: null, status: 'confirmed',
    }))

  // 5. Mudar la inscripción a otra clase más cara (el WITH CHECK implícito solo
  //    mira student_id, así que class_id queda libre).
  await attack('enrollments.class_id → otra clase (alumno)',
    () => S.from('enrollments').update({ class_id: ids.classId3 }).eq('id', ids.enrollment),
    async () => (await reads.enrollment('class_id')).data?.class_id === ids.classId3)

  // 6. Rearmar el premio de referido (auto-referido + reset del flag).
  await attack('profiles.referral_rewarded/referred_by (alumno)',
    () => S.from('profiles').update({ referral_rewarded: false, referred_by: ids.student }).eq('id', ids.student),
    async () => (await reads.profile('referred_by')).data?.referred_by === ids.student)

  // 7. Aparentar cuenta MP conectada (habilita el botón de pago sin OAuth real).
  await attack('profiles.mp_connected (alumno)',
    () => S.from('profiles').update({ mp_connected: true }).eq('id', ids.student),
    async () => (await reads.profile('mp_connected')).data?.mp_connected === true)

  // 8. Valorar a un profesor con el que nunca tomó clases.
  await attack('ratings.insert sin inscripción (alumno)',
    () => S.from('ratings').insert({ rater_id: ids.student, rated_user_id: ids.teacher, stars: 1 }))

  // 9. Entrada gratis a un evento pagado.
  await attack('event_enrollments.status → confirmed (alumno)',
    () => S.from('event_enrollments').update({ status: 'confirmed' }).eq('id', ids.eventEnrollment),
    async () => (await admin.from('event_enrollments').select('status').eq('id', ids.eventEnrollment).single()).data?.status === 'confirmed')

  // 10. Pago de evento fabricado como verificado.
  await attack('event_payments.insert verified (alumno)',
    () => S.from('event_payments').insert({
      event_id: ids.event, enrollment_id: ids.eventEnrollment, user_id: ids.student, amount: 1, status: 'verified',
    }))

  // 11. Paquete confirmado sin pagar.
  await attack('package_enrollments.status → confirmed (alumno)',
    () => S.from('package_enrollments').update({ status: 'confirmed' }).eq('id', ids.packageEnrollment),
    async () => (await admin.from('package_enrollments').select('status').eq('id', ids.packageEnrollment).single()).data?.status === 'confirmed')

  // 12. Forzarle el turno de pago 2x al compañero (el turno lo asigna el
  //     servidor en /api/class-2x/match y se transfiere por su propia ruta).
  await attack('class_2x_requests.payment_assignee → compañero (dueño de la fila)',
    () => S.from('class_2x_requests').update({ payment_assignee: ids.partner }).eq('id', ids.request2x),
    async () => (await admin.from('class_2x_requests').select('payment_assignee').eq('id', ids.request2x).single()).data?.payment_assignee === ids.partner)

  // 13. El profesor reescribiendo la contabilidad: comisión de la plataforma a 0.
  await attack('payments.commission_amount → 0 (profesor)',
    () => T.from('payments').update({ commission_amount: 0, amount: 99999 }).eq('id', ids.payment),
    async () => (await admin.from('payments').select('commission_amount').eq('id', ids.payment).single()).data?.commission_amount === 0)

  expect(breaches, `escrituras que NO deberían haber pasado:\n  - ${breaches.join('\n  - ')}`).toEqual([])
})

test('los caminos legítimos de escritura desde el cliente siguen funcionando', async () => {
  test.setTimeout(120_000)

  // (a) El alumno edita su propio perfil (campos no protegidos).
  const { error: profErr } = await S.from('profiles').update({ full_name: 'Nombre nuevo', bio: 'hola' }).eq('id', ids.student)
  expect(profErr?.message ?? null, 'editar perfil propio').toBeNull()

  // (b) El profesor YA NO confirma desde el cliente (P1-8, migración 069). Ese
  // camino dejaba al alumno `confirmed` pero sin token QR de asistencia, sin
  // tocar `payments` y sin confirmar al compañero de un 2x. La alternativa es
  // POST /api/payment/confirm { action: 'confirm_offline' }, que registra el
  // pago recibido fuera de la app y confirma por el camino completo.
  const { error: confErr } = await T.from('enrollments').update({ status: 'confirmed' }).eq('id', ids.enrollment)
  expect(confErr?.message ?? null, 'profesor confirmando desde el cliente debe fallar').toBe('enrollment_status_transition_not_allowed')
  expect((await admin.from('enrollments').select('status').eq('id', ids.enrollment).single()).data.status).not.toBe('confirmed')

  // (c) El profesor elimina a un alumno de la clase (lo único que le queda).
  const { error: rmErr } = await T.from('enrollments').update({ status: 'cancelled' }).eq('id', ids.enrollment)
  expect(rmErr?.message ?? null, 'profesor eliminando alumno').toBeNull()
  expect((await admin.from('enrollments').select('status').eq('id', ids.enrollment).single()).data.status).toBe('cancelled')

  // (d) El alumno abre y cancela su propia búsqueda 2x.
  const { data: own2x, error: ins2xErr } = await S
    .from('class_2x_requests')
    .insert({ user_id: ids.student, class_id: ids.classId2, status: 'looking' })
    .select('id').single()
  expect(ins2xErr?.message ?? null, 'crear búsqueda 2x propia').toBeNull()
  const { error: cancel2xErr } = await S.from('class_2x_requests').update({ status: 'cancelled' }).eq('id', own2x.id)
  expect(cancel2xErr?.message ?? null, 'cancelar búsqueda 2x propia').toBeNull()
  expect((await admin.from('class_2x_requests').select('status').eq('id', own2x.id).single()).data.status).toBe('cancelled')

  // (e) Flujo de evento completo desde el cliente: el alumno se inscribe…
  const evento2 = await ins('events', {
    creator_id: ids.teacher, title: '[TEST] rls event 2', event_type: 'masterclass',
    event_date: '2027-04-02', event_time: '18:00', city: 'Santiago', entry_price: 5000, status: 'active',
  })
  ids.event2 = evento2
  const { error: evEnrErr } = await S.from('event_enrollments').insert({ event_id: evento2, user_id: ids.student })
  expect(evEnrErr?.message ?? null, 'alumno inscribiéndose a un evento').toBeNull()

  // …sube comprobante…
  const { error: evPayErr } = await S.from('event_payments').insert({
    event_id: ids.event, enrollment_id: ids.eventEnrollment, user_id: ids.student,
    amount: 8000, status: 'submitted', receipt_url: `${ids.student}/receipt.jpg`,
  })
  expect(evPayErr?.message ?? null, 'alumno subiendo comprobante de evento').toBeNull()

  const { error: evSubErr } = await S.from('event_enrollments').update({ status: 'payment_submitted' }).eq('id', ids.eventEnrollment)
  expect(evSubErr?.message ?? null, 'alumno marcando comprobante enviado').toBeNull()

  // …y el organizador lo confirma (EventDetailClient).
  const { error: evConfErr } = await T.from('event_enrollments').update({ status: 'confirmed' }).eq('id', ids.eventEnrollment)
  expect(evConfErr?.message ?? null, 'organizador confirmando inscripción').toBeNull()
  const { error: evVerErr } = await T.from('event_payments').update({ status: 'verified' }).eq('enrollment_id', ids.eventEnrollment)
  expect(evVerErr?.message ?? null, 'organizador verificando pago de evento').toBeNull()
  expect((await admin.from('event_payments').select('status').eq('enrollment_id', ids.eventEnrollment).single()).data.status).toBe('verified')

  // (f) El servicio (service role) sigue pudiendo escribir todo lo protegido.
  const { error: svcErr } = await admin
    .from('enrollments')
    .update({ status: 'confirmed', hold_expires_at: null })
    .eq('id', ids.enrollment)
  expect(svcErr?.message ?? null, 'service role escribiendo columnas protegidas').toBeNull()
})

test.afterAll(async () => {
  for (const key of ['classId', 'classId2', 'classId3']) if (ids[key]) await admin.from('classes').delete().eq('id', ids[key])
  if (ids.package) await admin.from('class_packages').delete().eq('id', ids.package)
  for (const key of ['event', 'event2']) if (ids[key]) await admin.from('events').delete().eq('id', ids[key])
  for (const key of ['teacher', 'student', 'partner']) {
    if (ids[key]) await admin.auth.admin.deleteUser(ids[key]).catch(() => {})
  }
})
