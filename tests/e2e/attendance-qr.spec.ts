/**
 * Seguridad y casos borde del flujo QR de asistencia.
 *
 * Web y mobile llaman al MISMO endpoint POST /api/attendance/scan y a las
 * mismas tablas qr_tokens/attendance; las garantías viven todas server-side.
 * Por eso esta suite (nivel endpoint + DB real) es autoritativa para ambas
 * plataformas. Se ejercitan las dos mecánicas de auth: Bearer (= mobile) en el
 * grueso, y cookie (= web) en un test con browser. Un smoke de UI web verifica
 * el render del QR del alumno y el gate de la pantalla de escaneo.
 *
 * SIN DATA FANTASMA: cada token se emite por el PATH REAL
 * (/api/payment/confirm → autoConfirmPayment → HMAC con el secreto real). Los
 * únicos tokens inválidos son los del caso 1 (deben serlo). Las aserciones leen
 * filas reales de la DB.
 *
 * Requisitos para correr (ver tests/e2e/helpers/attendance.ts):
 *   - Supabase de test/local con la migración 054 aplicada.
 *   - `npm run dev:web` en http://localhost:3000 con QR_TOKEN_SECRET configurado.
 *   - Env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (o NEXT_PUBLIC_*), SUPABASE_URL.
 */

import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './helpers/auth'
import {
  createUser, deleteUser, signIn, grantPro, seedClass, seedEnrollment, seedPayment,
  getQrRow, attendanceCount, setEnrollmentStatus, setNonce, cleanupByTitlePrefix,
  type TestUser, type QrRow,
} from './helpers/attendance'

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

let teacher: TestUser
let student: TestUser
let teacherToken: string
let studentToken: string

function bearer(tok: string) {
  return { headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } }
}

function scan(request: APIRequestContext, authToken: string, token: string) {
  return request.post('/api/attendance/scan', { ...bearer(authToken), data: { token } })
}

/** Emite un token real: siembra enrollment+payment y CONFIRMA vía el endpoint real. */
async function emitConfirmedToken(
  request: APIRequestContext,
  classId: string,
  studentId: string,
): Promise<{ enrollmentId: string; qr: QrRow }> {
  const enrollmentId = await seedEnrollment(classId, studentId, 'payment_submitted')
  const paymentId = await seedPayment(enrollmentId, 5000, 'pending')
  const res = await request.post('/api/payment/confirm', {
    ...bearer(teacherToken),
    data: { paymentId, action: 'confirm' },
  })
  expect(res.ok(), `confirm falló: ${res.status()} ${await res.text()}`).toBeTruthy()
  const qr = await getQrRow(enrollmentId)
  expect(qr, 'no se emitió token QR tras confirmar — ¿QR_TOKEN_SECRET seteado en el server?').not.toBeNull()
  expect(qr!.status).toBe('active')
  return { enrollmentId, qr: qr! }
}

test.describe.serial('QR de asistencia — seguridad y bordes', () => {
  // Cada test hace varios round-trips HTTP (confirm + scan) + DB; el default de 30s
  // no alcanza para el pack de 4.
  test.describe.configure({ timeout: 120_000 })

  test.beforeAll(async () => {
    teacher = await createUser('qr-teacher')
    await grantPro(teacher.id)
    student = await createUser('qr-student')
    teacherToken = await signIn(teacher.email, teacher.password)
    studentToken = await signIn(student.email, student.password)
  })

  test.afterAll(async () => {
    await cleanupByTitlePrefix()
    if (teacher) await deleteUser(teacher.id)
    if (student) await deleteUser(student.id)
  })

  test('baseline (Bearer = mobile): escaneo válido registra asistencia', async ({ request }) => {
    const classId = await seedClass(teacher.id)
    const { qr } = await emitConfirmedToken(request, classId, student.id)

    const res = await scan(request, teacherToken, qr.token)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('confirmed')
    expect(body.student?.full_name).toBeTruthy()
    expect(await attendanceCount(qr.id)).toBe(1)
  })

  // 1. Firma inválida / manipulada → rechazado.
  test('1 · firma inválida o manipulada es rechazada', async ({ request }) => {
    const classId = await seedClass(teacher.id)
    const { enrollmentId, qr } = await emitConfirmedToken(request, classId, student.id)

    // (a) token inexistente (lookup miss)
    let body = await (await scan(request, teacherToken, 'no-es-un-token-real-xxxx')).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('invalid_signature')

    // (b) token real con caracteres alterados
    const tampered = qr.token.slice(0, -2) + (qr.token.endsWith('AA') ? 'BB' : 'AA')
    body = await (await scan(request, teacherToken, tampered)).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('invalid_signature')

    // (c) defensa HMAC: mutar el nonce en DB y escanear el token original →
    //     recompute(secret, ...nuevo nonce) ≠ token almacenado → invalid_signature.
    await setNonce(enrollmentId, `nonce-mutado-${Date.now()}`)
    body = await (await scan(request, teacherToken, qr.token)).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('invalid_signature')

    // ninguno registró asistencia
    expect(await attendanceCount(qr.id)).toBe(0)
  })

  // 2. Token revocado (estudiante desinscrito) → rechazado.
  test('2 · token revocado tras desinscripción es rechazado', async ({ request }) => {
    const classId = await seedClass(teacher.id)
    const { enrollmentId, qr } = await emitConfirmedToken(request, classId, student.id)

    const leave = await request.post('/api/class/leave', { ...bearer(studentToken), data: { enrollmentId } })
    expect(leave.ok()).toBeTruthy()

    const body = await (await scan(request, teacherToken, qr.token)).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('revoked')

    const row = await getQrRow(enrollmentId)
    expect(row!.status).toBe('revoked')
    expect(row!.revoked_at).toBeTruthy()
    expect(await attendanceCount(qr.id)).toBe(0)
  })

  // 3. Pago no confirmado → sin token / rechazado.
  test('3 · pago no confirmado no emite token y el guard lo rechaza', async ({ request }) => {
    // (primary) enrollment pendiente → NO se emite token
    const classId = await seedClass(teacher.id)
    const enrollmentId = await seedEnrollment(classId, student.id, 'pending_payment')
    await seedPayment(enrollmentId, 5000, 'pending')
    expect(await getQrRow(enrollmentId)).toBeNull()

    // (defensa en profundidad) token activo pero enrollment forzado a no-confirmado
    const classId2 = await seedClass(teacher.id)
    const { enrollmentId: e2, qr: qr2 } = await emitConfirmedToken(request, classId2, student.id)
    await setEnrollmentStatus(e2, 'pending_payment')
    const body = await (await scan(request, teacherToken, qr2.token)).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('payment_not_confirmed')
    expect(await attendanceCount(qr2.id)).toBe(0)
  })

  // 4. QR de una clase escaneado por profesor de otra clase → rechazado.
  test('4 · profesor ajeno a la clase es rechazado (sin filtrar PII)', async ({ request }) => {
    const classA = await seedClass(teacher.id)
    const { qr: qrA } = await emitConfirmedToken(request, classA, student.id)
    // el student es "profesor de otra clase"
    await seedClass(student.id, { title: '[TEST-QR] Clase de otro profe' })

    const body = await (await scan(request, studentToken, qrA.token)).json()
    expect(body.status).toBe('rejected')
    expect(body.reason).toBe('wrong_class')
    expect(body.student).toBeFalsy() // no revela datos del alumno a un profe ajeno
    expect(await attendanceCount(qrA.id)).toBe(0)
  })

  // 5. Pack de N — modelo real (N tokens) + invariante single-token multi-fecha.
  test('5a · pack de 4 (4 clases/4 tokens): 4 check-ins, re-escaneo no duplica', async ({ request }) => {
    const qrs: QrRow[] = []
    for (let i = 0; i < 4; i++) {
      const c = await seedClass(teacher.id, { title: `[TEST-QR] Pack ${i}` })
      const { qr } = await emitConfirmedToken(request, c, student.id)
      qrs.push(qr)
    }
    for (const qr of qrs) {
      const body = await (await scan(request, teacherToken, qr.token)).json()
      expect(body.status).toBe('confirmed')
    }
    for (const qr of qrs) expect(await attendanceCount(qr.id)).toBe(1)

    // re-escaneo del mismo (misma fecha = hoy) → ya registrado, sin doble conteo
    const again = await (await scan(request, teacherToken, qrs[0].token)).json()
    expect(again.status).toBe('already_registered')
    expect(await attendanceCount(qrs[0].id)).toBe(1)
  })

  test('5b · invariante: un token acepta 1 asistencia por fecha distinta, no dos en la misma', async ({ request }) => {
    // NOTA: el endpoint sella session_date = hoy (server-side, sin backdoor de
    // reloj por seguridad). La capacidad "N fechas → N check-ins" se verifica
    // aquí sobre el constraint UNIQUE(qr_token_id, session_date) que la respalda:
    // se driva HOY por el endpoint y se agregan fechas pasadas con las MISMAS
    // columnas que escribe el endpoint.
    const jsWeekday = new Date().getDay()
    const classId = await seedClass(teacher.id, {
      title: '[TEST-QR] Periodica pack',
      type: 'periodica', recurrence: 'weekly', day_of_week: jsWeekday,
      date: null, time: null, recurring_time: '19:00',
      start_date: '2020-01-01', ends_indefinitely: true,
    })
    const { qr } = await emitConfirmedToken(request, classId, student.id)

    // hoy, vía endpoint real
    const today = await (await scan(request, teacherToken, qr.token)).json()
    expect(today.status).toBe('confirmed')
    expect(await attendanceCount(qr.id)).toBe(1)

    // 3 fechas pasadas distintas — mismas columnas que escribe la ruta
    const { admin } = await import('./helpers/attendance')
    for (const d of ['2020-01-01', '2020-01-02', '2020-01-03']) {
      const { error } = await (admin() as any).from('attendance').insert({
        qr_token_id: qr.id, student_id: student.id, class_id: classId,
        session_date: d, checked_in_by: teacher.id,
      })
      expect(error, `inserción de fecha ${d} debería permitirse`).toBeNull()
    }
    expect(await attendanceCount(qr.id)).toBe(4) // 4 fechas → 4 check-ins

    // duplicar una fecha existente → 23505, sin doble conteo
    const dup = await (admin() as any).from('attendance').insert({
      qr_token_id: qr.id, student_id: student.id, class_id: classId,
      session_date: '2020-01-01', checked_in_by: teacher.id,
    })
    expect(dup.error?.code).toBe('23505')
    expect(await attendanceCount(qr.id)).toBe(4)
  })

  // 6. Escaneo doble rápido → idempotente.
  test('6 · dos escaneos concurrentes registran una sola asistencia', async ({ request }) => {
    const classId = await seedClass(teacher.id)
    const { qr } = await emitConfirmedToken(request, classId, student.id)

    const [r1, r2] = await Promise.all([
      scan(request, teacherToken, qr.token),
      scan(request, teacherToken, qr.token),
    ])
    const statuses = [(await r1.json()).status, (await r2.json()).status].sort()
    expect(statuses).toEqual(['already_registered', 'confirmed'])
    expect(await attendanceCount(qr.id)).toBe(1)
  })

  // 7. Revocación inhabilita el acceso de inmediato.
  test('7 · la revocación bloquea el escaneo en el acto (incl. vista RLS del alumno)', async ({ request }) => {
    const classId = await seedClass(teacher.id)
    const { enrollmentId, qr } = await emitConfirmedToken(request, classId, student.id)

    await request.post('/api/class/leave', { ...bearer(studentToken), data: { enrollmentId } })

    // escaneo inmediato → rechazado
    const body = await (await scan(request, teacherToken, qr.token)).json()
    expect(body.reason).toBe('revoked')
    expect(await attendanceCount(qr.id)).toBe(0)

    // el alumno, con su propia sesión (RLS qr_tokens_select_own), ve 'revoked'
    const sc = createClient(SUPA_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${studentToken}` } },
      auth: { persistSession: false },
    })
    const { data } = await (sc as any).from('qr_tokens').select('status').eq('enrollment_id', enrollmentId).maybeSingle()
    expect(data?.status).toBe('revoked')
  })

  // Web (cookie auth): el mismo endpoint acepta la sesión por cookie del browser.
  test('web · cookie auth: el profesor confirma asistencia por el mismo endpoint', async ({ page, request }) => {
    const classId = await seedClass(teacher.id)
    const { qr } = await emitConfirmedToken(request, classId, student.id)

    await loginAs(page, teacher.email, teacher.password)
    const res = await page.request.post('/api/attendance/scan', { data: { token: qr.token } })
    expect(res.status()).toBe(200)
    expect((await res.json()).status).toBe('confirmed')
  })
})

// Smoke de UI web (no ejercita la cámara; valida render del QR y gate de la ruta).
test.describe.serial('QR de asistencia — smoke UI web', () => {
  test.describe.configure({ timeout: 120_000 })

  let t: TestUser
  let s: TestUser
  let tTok: string

  test.beforeAll(async () => {
    t = await createUser('qr-ui-teacher')
    await grantPro(t.id)
    s = await createUser('qr-ui-student')
    tTok = await signIn(t.email, t.password)
  })

  test.afterAll(async () => {
    await cleanupByTitlePrefix()
    if (t) await deleteUser(t.id)
    if (s) await deleteUser(s.id)
  })

  test('el alumno con pago confirmado ve su código QR', async ({ page, request }) => {
    const classId = await seedClass(t.id, { title: '[TEST-QR] UI QR alumno' })
    const enrollmentId = await seedEnrollment(classId, s.id, 'payment_submitted')
    const paymentId = await seedPayment(enrollmentId, 5000, 'pending')
    const res = await request.post('/api/payment/confirm', { headers: { Authorization: `Bearer ${tTok}`, 'Content-Type': 'application/json' }, data: { paymentId, action: 'confirm' } })
    expect(res.ok()).toBeTruthy()

    await loginAs(page, s.email, s.password)
    await page.goto(`/class/${classId}`)
    const qrBlock = page.getByText('Tu código de asistencia')
    await expect(qrBlock).toBeVisible({ timeout: 10_000 })
    // el QR se renderiza como <svg> dentro del bloque
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('el profesor ve "Escanear" y la pantalla de escaneo exige ser dueño', async ({ page }) => {
    const classId = await seedClass(t.id, { title: '[TEST-QR] UI escaner' })

    await loginAs(page, t.email, t.password)
    await page.goto(`/class/${classId}`)
    await expect(page.getByRole('link', { name: /escanear/i })).toBeVisible({ timeout: 10_000 })
  })

  test('un no-dueño es redirigido fuera de /scan-attendance', async ({ page }) => {
    const classId = await seedClass(t.id, { title: '[TEST-QR] UI gate' })

    await loginAs(page, s.email, s.password)
    // Chequeo directo del guard server-side vía HTTP con la cookie real del
    // browser (sin depender de timing de navegación cliente): un no-dueño debe
    // recibir un redirect hacia /class/:id, nunca 200 con la página de escaneo.
    const res = await page.request.get(`/class/${classId}/scan-attendance`, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    const location = res.headers()['location'] ?? ''
    expect(location).toContain(`/class/${classId}`)
    expect(location).not.toContain('scan-attendance')
    expect(location).not.toContain('/auth/login') // estaba logueado, no es falta de sesión
  })
})
