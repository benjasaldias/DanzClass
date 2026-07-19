/**
 * Helpers para la suite de seguridad del QR de asistencia
 * (tests/e2e/attendance-qr.spec.ts).
 *
 * Toda la data es REAL contra la instancia de Supabase de test/local:
 * usuarios creados vía auth.admin, clases/inscripciones/pagos con las columnas
 * reales del schema, y tokens emitidos por el PATH REAL (/api/payment/confirm →
 * autoConfirmPayment → HMAC). No hay fixtures ni tokens fabricados salvo los
 * deliberadamente inválidos del caso 1.
 *
 * Requisitos de entorno (nunca apuntar a producción):
 *   SUPABASE_URL                 (default http://127.0.0.1:54321 — stack local)
 *   SUPABASE_SERVICE_ROLE_KEY    (service role del stack de test/local)
 *   SUPABASE_ANON_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   + la migración 054 aplicada y el server `npm run dev:web` corriendo.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// supabase-js instancia un RealtimeClient que exige WebSocket global; Node < 22
// no lo trae. `ws` ya está en node_modules. Se setea una vez al importar este
// módulo, antes de cualquier createClient (helper y spec).
if (!(globalThis as any).WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as any).WebSocket = require('ws')
}

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const TEST_PASSWORD = 'Test1234!qr'

export function admin(): SupabaseClient {
  if (!SERVICE) {
    throw new Error(
      'attendance tests require SUPABASE_SERVICE_ROLE_KEY (test/local instance, NEVER production).',
    )
  }
  return createClient(URL, SERVICE, { auth: { persistSession: false } })
}

export type TestUser = { id: string; email: string; password: string }

/** Crea un usuario real (auth.admin) con email único. El trigger handle_new_user crea el profile. */
export async function createUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.danzclass.local`
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    // handle_new_user copia full_name desde raw_user_meta_data; sin esto queda ''.
    user_metadata: { full_name: `QA ${prefix}` },
  })
  if (error || !data.user) throw new Error(`createUser(${prefix}): ${error?.message}`)
  return { id: data.user.id, email, password: TEST_PASSWORD }
}

/** Borra el usuario; el cascade limpia profile → classes → enrollments → payments → qr_tokens → attendance. */
export async function deleteUser(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id).catch(() => {})
}

/** Inicia sesión con anon key y devuelve el access_token (mismo mecanismo Bearer que el mobile). */
export async function signIn(email: string, password: string): Promise<string> {
  if (!ANON) throw new Error('attendance tests require SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn(${email}): ${error?.message}`)
  return data.session.access_token
}

export async function grantPro(userId: string): Promise<void> {
  const exp = new Date()
  exp.setFullYear(exp.getFullYear() + 1)
  await (admin() as any)
    .from('subscriptions')
    .insert({ user_id: userId, tier: 'pro', status: 'active', expires_at: exp.toISOString() })
}

/** Fecha de hoy en America/Santiago (igual que el endpoint de scan), no UTC. */
export function todayInChile(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Inserta una clase real (columnas reales del schema). Suelta con fecha = hoy (Santiago) por defecto. */
export async function seedClass(teacherId: string, over: Record<string, any> = {}): Promise<string> {
  const today = todayInChile()
  const { data, error } = await (admin() as any)
    .from('classes')
    .insert({
      teacher_id: teacherId,
      title: '[TEST-QR] Clase',
      type: 'suelta',
      dance_style: 'House',
      level: 'todos',
      date: today,
      time: '19:00',
      duration_minutes: 60,
      city: 'Santiago',
      max_spots: 10,
      price: 5000,
      status: 'active',
      ...over,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedClass: ${error?.message}`)
  return data.id
}

export async function seedEnrollment(
  classId: string,
  studentId: string,
  status = 'payment_submitted',
): Promise<string> {
  const { data, error } = await (admin() as any)
    .from('enrollments')
    .insert({ class_id: classId, student_id: studentId, session_id: null, status })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedEnrollment: ${error?.message}`)
  return data.id
}

export async function seedPayment(enrollmentId: string, amount = 5000, status = 'pending'): Promise<string> {
  const { data, error } = await (admin() as any)
    .from('payments')
    .insert({ enrollment_id: enrollmentId, amount, status })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedPayment: ${error?.message}`)
  return data.id
}

export type QrRow = { id: string; token: string; nonce: string; status: string; revoked_at: string | null }

export async function getQrRow(enrollmentId: string): Promise<QrRow | null> {
  const { data } = await (admin() as any)
    .from('qr_tokens')
    .select('id, token, nonce, status, revoked_at')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()
  return (data as QrRow) ?? null
}

export async function attendanceCount(qrTokenId: string): Promise<number> {
  const { count } = await (admin() as any)
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('qr_token_id', qrTokenId)
  return count ?? 0
}

export async function setEnrollmentStatus(enrollmentId: string, status: string): Promise<void> {
  await (admin() as any).from('enrollments').update({ status }).eq('id', enrollmentId)
}

export async function setNonce(enrollmentId: string, nonce: string): Promise<void> {
  await (admin() as any).from('qr_tokens').update({ nonce }).eq('enrollment_id', enrollmentId)
}

/** Limpia por prefijo de título como red de seguridad (además del cascade al borrar usuarios). */
export async function cleanupByTitlePrefix(prefix = '[TEST-QR]'): Promise<void> {
  const a = admin()
  const { data: classes } = await (a as any).from('classes').select('id').like('title', `${prefix}%`)
  const ids = (classes ?? []).map((c: any) => c.id)
  if (!ids.length) return
  const { data: enr } = await (a as any).from('enrollments').select('id').in('class_id', ids)
  const enrIds = (enr ?? []).map((e: any) => e.id)
  if (enrIds.length) {
    const { data: qr } = await (a as any).from('qr_tokens').select('id').in('enrollment_id', enrIds)
    const qrIds = (qr ?? []).map((q: any) => q.id)
    if (qrIds.length) await (a as any).from('attendance').delete().in('qr_token_id', qrIds)
    await (a as any).from('qr_tokens').delete().in('enrollment_id', enrIds)
    await (a as any).from('payments').delete().in('enrollment_id', enrIds)
    await (a as any).from('enrollments').delete().in('id', enrIds)
  }
  await (a as any).from('classes').delete().in('id', ids)
}
