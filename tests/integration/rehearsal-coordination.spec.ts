/**
 * Integración (stack local Docker) — caducidad y coordinación de ensayos
 * (077_rehearsal_expiry_and_coordination.sql).
 *
 * Tres cosas que sólo se pueden verificar contra una base de datos real:
 *
 *   1. CADUCIDAD — `rehearsals.expires_at` la calcula un trigger en SQL, y el
 *      helper de `packages/shared` es un ESPEJO de esa función. Si divergen, la
 *      UI dice "caduca el X" y la base borra otro día. Acá se comparan los dos
 *      resultados sobre las mismas filas.
 *   2. RLS de las tablas nuevas — `rehearsal_discards` la escribe el CLIENTE,
 *      así que su defensa entera es la policy: se prueba con JWT real (el mismo
 *      camino que un POST a PostgREST desde el navegador), nunca con service
 *      role, que no evalúa RLS y daría todo por bueno.
 *   3. FLUJO DE VOTACIÓN — el umbral, el "Fijar ahora", la única votación
 *      abierta y que fijar la fecha cambie de verdad la caducidad del ensayo.
 *      Los bloques `needsServer` hablan por HTTP con la app real.
 *
 * Los bloques marcados con `needsServer` requieren `npm run dev:web` apuntando
 * al stack local. Si no está, se saltan en vez de fallar (igual que el resto de
 * la suite; en CI aparecen como "skipped").
 *
 * Requiere el stack local (`npm run db:start`). Correr con:
 *   npm run test:integration
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  rehearsalExpiresAt,
  isProposalStale,
  tallyProposal,
} from '../../packages/shared/src/lib/rehearsalSchedule'
import {
  toggleDayDiscard,
  toggleHourDiscard,
  buildDiscardIndex,
} from '../../packages/shared/src/lib/rehearsalDiscards'

const ROOT = resolve(__dirname, '../..')

for (const line of readFileSync(`${ROOT}/apps/web/.env.development.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}

// Node < 22 no trae WebSocket nativo y `createClient` construye un
// RealtimeClient aunque nunca lo usemos.
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
  const email = `${prefix}-${stamp}@rctest.local`
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

/** Mes de coordinación siempre a futuro, para que nada caduque durante el test. */
function futureMonth(offset = 2): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dayInMonth(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`
}

async function mkRehearsal(creatorId: string, row: Record<string, any> = {}): Promise<string> {
  const { data, error } = await admin.from('rehearsals').insert({
    creator_id: creatorId,
    title: `[TEST] ensayo ${stamp}`,
    date_mode: 'coordinate',
    coordinate_month: futureMonth(),
    duration_minutes: 60,
    ...row,
  }).select('id').single()
  if (error) throw new Error(`seed rehearsals: ${error.message}`)
  return data.id
}

async function invite(rehearsalId: string, userId: string, status = 'accepted') {
  const { error } = await admin.from('rehearsal_invites')
    .insert({ rehearsal_id: rehearsalId, user_id: userId, status })
  if (error) throw new Error(`seed invites: ${error.message}`)
}

async function readRehearsal(id: string) {
  const { data } = await admin.from('rehearsals').select('*').eq('id', id).single()
  return data
}

async function api(path: string, token: string, body: unknown): Promise<Response> {
  return fetch(`${APP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

/**
 * El body de un Response sólo se puede leer UNA vez, así que se lee acá y se
 * devuelven status + json juntos. Meter `await res.text()` dentro del mensaje de
 * un `expect(res.status)` consume el body y el `res.json()` siguiente revienta
 * con "Body is unusable" — que enmascara el fallo real.
 */
async function apiJson(path: string, token: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await api(path, token, body)
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  return { status: res.status, json }
}

/** Abre una votación y falla con el error del servidor si no sale 200. */
async function openProposal(
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const { status, json } = await apiJson('/api/rehearsal/proposal/create', token, body)
  expect(status, `create devolvió ${status}: ${JSON.stringify(json)}`).toBe(200)
  return json.proposal
}

/**
 * Umbral que NO se alcanza con los votos que el test emite, pero que sigue
 * siendo válido: la ruta rechaza pedir más confirmaciones que integrantes, y el
 * seed tiene 3 (creador + aceptado + pendiente; el rechazado no cuenta).
 */
const UNREACHABLE = 3

const MONTH = futureMonth()

let creator: User
let memberA: User
let memberB: User
let rejected: User
let stranger: User
let coordRehearsal: string
const createdRehearsals: string[] = []

async function seedRehearsal(row: Record<string, any> = {}, members = true): Promise<string> {
  const id = await mkRehearsal(creator.id, row)
  createdRehearsals.push(id)
  if (members) {
    await invite(id, memberA.id, 'accepted')
    await invite(id, memberB.id, 'pending')
    await invite(id, rejected.id, 'rejected')
  }
  return id
}

test.beforeAll(async () => {
  creator = await mkUser('rccrea')
  memberA = await mkUser('rcmema')
  memberB = await mkUser('rcmemb')
  rejected = await mkUser('rcrech')
  stranger = await mkUser('rcotro')

  coordRehearsal = await seedRehearsal()

  serverUp = await fetch(APP).then(() => true).catch(() => false)
})

test.afterAll(async () => {
  if (createdRehearsals.length > 0) {
    await admin.from('rehearsals').delete().in('id', createdRehearsals)
  }
  for (const u of [creator, memberA, memberB, rejected, stranger]) {
    if (u) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

// ─────────────────────────────────────────────────────────────
// 1. Caducidad — el trigger SQL y el helper TS tienen que coincidir
// ─────────────────────────────────────────────────────────────

test.describe('expires_at (trigger de 077)', () => {
  test('un ensayo con fecha fija caduca 2 h después de TERMINAR', async () => {
    const id = await seedRehearsal({
      date_mode: 'single',
      coordinate_month: null,
      rehearsal_date: dayInMonth(MONTH, 14),
      rehearsal_time: '19:00',
      duration_minutes: 90,
    }, false)
    const row = await readRehearsal(id)

    expect(row.expires_at).not.toBeNull()
    // El helper compartido y el SQL deben dar el MISMO instante: uno alimenta la
    // UI y el otro la base. Si divergen, la app promete un día y borra otro.
    const fromHelper = rehearsalExpiresAt(row)
    expect(new Date(row.expires_at).getTime()).toBe(fromHelper!.getTime())
  })

  test('coordinando sin fecha caduca al empezar el mes siguiente', async () => {
    const row = await readRehearsal(coordRehearsal)
    expect(row.expires_at).not.toBeNull()
    expect(new Date(row.expires_at).getTime()).toBe(rehearsalExpiresAt(row)!.getTime())

    // El mes de coordinación es el plazo: la caducidad cae fuera de ese mes.
    expect(String(row.expires_at).slice(0, 7)).not.toBe(MONTH)
  })

  test('varias fechas: manda la última, no el orden del array', async () => {
    const id = await seedRehearsal({
      date_mode: 'custom',
      coordinate_month: null,
      custom_dates: [dayInMonth(MONTH, 20), dayInMonth(MONTH, 5), dayInMonth(MONTH, 12)],
    }, false)
    const row = await readRehearsal(id)
    expect(new Date(row.expires_at).getTime()).toBe(rehearsalExpiresAt(row)!.getTime())
    // Después del día 20, no del 5.
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(
      new Date(`${dayInMonth(MONTH, 20)}T23:59:00`).getTime(),
    )
  })

  test('un `single` SIN fecha no caduca — no se borra por datos incompletos', async () => {
    const id = await seedRehearsal({
      date_mode: 'single', coordinate_month: null, rehearsal_date: null,
    }, false)
    const row = await readRehearsal(id)
    expect(row.expires_at).toBeNull()
  })

  test('expires_at es derivada: ni el service role puede empujarla al futuro', async () => {
    const row = await readRehearsal(coordRehearsal)
    const original = row.expires_at

    await admin.from('rehearsals')
      .update({ expires_at: '2099-01-01T00:00:00.000Z' })
      .eq('id', coordRehearsal)

    const after = await readRehearsal(coordRehearsal)
    // El trigger la recalcula siempre. Sin esto, el creador se queda en el feed
    // para siempre con un PATCH directo a PostgREST.
    expect(after.expires_at).toBe(original)
  })

  test('cambiar el mes de coordinación mueve la caducidad', async () => {
    const id = await seedRehearsal({ coordinate_month: futureMonth(2) }, false)
    const before = await readRehearsal(id)
    await admin.from('rehearsals').update({ coordinate_month: futureMonth(5) }).eq('id', id)
    const after = await readRehearsal(id)
    expect(new Date(after.expires_at).getTime()).toBeGreaterThan(new Date(before.expires_at).getTime())
  })

  test("'expired' es un estado válido y distinto de 'cancelled'", async () => {
    const id = await seedRehearsal({}, false)
    const { error } = await admin.from('rehearsals').update({ status: 'expired' }).eq('id', id)
    expect(error).toBeNull()
    const row = await readRehearsal(id)
    expect(row.status).toBe('expired')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. RLS de rehearsal_discards — escritura de cliente, con JWT real
// ─────────────────────────────────────────────────────────────

test.describe('rehearsal_discards (RLS)', () => {
  test('un integrante descarta un día y el grupo lo VE', async () => {
    const date = dayInMonth(MONTH, 10)
    const res = await toggleDayDiscard(memberA.client, coordRehearsal, memberA.id, date, true)
    expect(res.ok, `toggleDayDiscard: ${JSON.stringify(res)}`).toBe(true)

    // El creador lee el descarte de otro: es lo que hace posible el panel de
    // disponibilidad parcial (problema 3).
    const { data: seenByCreator } = await creator.client
      .from('rehearsal_discards')
      .select('user_id, discard_date, hour')
      .eq('rehearsal_id', coordRehearsal)
    expect((seenByCreator ?? []).some((d: any) => d.user_id === memberA.id && d.hour === null)).toBe(true)

    // Y otro integrante también.
    const { data: seenByB } = await memberB.client
      .from('rehearsal_discards')
      .select('user_id')
      .eq('rehearsal_id', coordRehearsal)
    expect((seenByB ?? []).length).toBeGreaterThan(0)

    await toggleDayDiscard(memberA.client, coordRehearsal, memberA.id, date, false)
  })

  test('descartar el día borra las horas sueltas de ese día', async () => {
    const date = dayInMonth(MONTH, 11)
    await toggleHourDiscard(memberA.client, coordRehearsal, memberA.id, date, 19, true, false)
    await toggleHourDiscard(memberA.client, coordRehearsal, memberA.id, date, 20, true, false)

    let { data: rows } = await admin.from('rehearsal_discards')
      .select('hour').eq('rehearsal_id', coordRehearsal).eq('user_id', memberA.id).eq('discard_date', date)
    expect((rows ?? []).length).toBe(2)

    await toggleDayDiscard(memberA.client, coordRehearsal, memberA.id, date, true)

    ;({ data: rows } = await admin.from('rehearsal_discards')
      .select('hour').eq('rehearsal_id', coordRehearsal).eq('user_id', memberA.id).eq('discard_date', date))
    // Una sola fila, la del día completo: guardar las dos sería la misma
    // información dos veces, y al recuperar el día reaparecerían.
    expect((rows ?? []).length).toBe(1)
    expect(rows![0].hour).toBeNull()

    await toggleDayDiscard(memberA.client, coordRehearsal, memberA.id, date, false)
  })

  test('recuperar UNA hora de un día descartado deja las otras 23 descartadas', async () => {
    const date = dayInMonth(MONTH, 12)
    await toggleDayDiscard(memberA.client, coordRehearsal, memberA.id, date, true)
    await toggleHourDiscard(memberA.client, coordRehearsal, memberA.id, date, 15, false, true)

    const { data: rows } = await admin.from('rehearsal_discards')
      .select('hour').eq('rehearsal_id', coordRehearsal).eq('user_id', memberA.id).eq('discard_date', date)

    const hours = (rows ?? []).map((r: any) => r.hour)
    expect(hours).toHaveLength(23)
    expect(hours).not.toContain(15)
    expect(hours).not.toContain(null)

    const idx = buildDiscardIndex((rows ?? []).map((r: any) => ({ ...r, user_id: memberA.id, discard_date: date })))
    expect(idx.hasHour(memberA.id, date, 15)).toBe(false)
    expect(idx.hasHour(memberA.id, date, 16)).toBe(true)

    await admin.from('rehearsal_discards').delete()
      .eq('rehearsal_id', coordRehearsal).eq('user_id', memberA.id).eq('discard_date', date)
  })

  test('ATAQUE: descartar EN NOMBRE DE OTRO integrante', async () => {
    const { error } = await memberA.client.from('rehearsal_discards').insert({
      rehearsal_id: coordRehearsal,
      user_id: memberB.id, // no es él
      discard_date: dayInMonth(MONTH, 13),
      hour: null,
    })
    expect(error, 'la policy debe rechazar un descarte ajeno').not.toBeNull()

    const { data } = await admin.from('rehearsal_discards')
      .select('id').eq('rehearsal_id', coordRehearsal).eq('user_id', memberB.id)
    expect((data ?? []).length).toBe(0)
  })

  test('ATAQUE: un desconocido descarta en un ensayo del que no es parte', async () => {
    const { error } = await stranger.client.from('rehearsal_discards').insert({
      rehearsal_id: coordRehearsal,
      user_id: stranger.id, // su propia fila… en un ensayo ajeno
      discard_date: dayInMonth(MONTH, 13),
      hour: 19,
    })
    // `user_id = auth.uid()` no alcanza: la policy exige además ser parte del
    // ensayo. Es el defecto de forma que 073 encontró en cinco tablas.
    expect(error, 'la policy debe exigir pertenencia al ensayo').not.toBeNull()
  })

  test('ATAQUE: quien RECHAZÓ la invitación no puede descartar ni leer', async () => {
    const { error } = await rejected.client.from('rehearsal_discards').insert({
      rehearsal_id: coordRehearsal,
      user_id: rejected.id,
      discard_date: dayInMonth(MONTH, 13),
      hour: 19,
    })
    // is_rehearsal_participant() excluye 'rejected' a propósito: quien dijo que
    // no va no coordina el horario.
    expect(error, 'un invitado rechazado no participa de la coordinación').not.toBeNull()
  })

  test('ATAQUE: un desconocido no LEE los descartes del grupo', async () => {
    await toggleHourDiscard(memberA.client, coordRehearsal, memberA.id, dayInMonth(MONTH, 14), 19, true, false)
    const { data } = await stranger.client
      .from('rehearsal_discards')
      .select('user_id')
      .eq('rehearsal_id', coordRehearsal)
    expect((data ?? []).length).toBe(0)
    await admin.from('rehearsal_discards').delete()
      .eq('rehearsal_id', coordRehearsal).eq('discard_date', dayInMonth(MONTH, 14))
  })

  test('no se puede descartar la misma hora dos veces (índice único parcial)', async () => {
    const date = dayInMonth(MONTH, 15)
    const row = { rehearsal_id: coordRehearsal, user_id: memberA.id, discard_date: date, hour: 19 }
    const { error: first } = await memberA.client.from('rehearsal_discards').insert(row)
    expect(first).toBeNull()
    const { error: second } = await memberA.client.from('rehearsal_discards').insert(row)
    expect(second?.code).toBe('23505')
    await admin.from('rehearsal_discards').delete().eq('rehearsal_id', coordRehearsal).eq('discard_date', date)
  })

  test('el día completo tampoco se duplica — el UNIQUE con NULL no bastaba', async () => {
    const date = dayInMonth(MONTH, 16)
    const row = { rehearsal_id: coordRehearsal, user_id: memberA.id, discard_date: date, hour: null }
    const { error: first } = await memberA.client.from('rehearsal_discards').insert(row)
    expect(first).toBeNull()
    const { error: second } = await memberA.client.from('rehearsal_discards').insert(row)
    // En un UNIQUE normal dos NULL son distintos y esto pasaría: de ahí los dos
    // índices parciales de 077.
    expect(second?.code).toBe('23505')
    await admin.from('rehearsal_discards').delete().eq('rehearsal_id', coordRehearsal).eq('discard_date', date)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. RLS de propuestas y votos — el cliente NO escribe
// ─────────────────────────────────────────────────────────────

test.describe('rehearsal_proposals / votes (RLS)', () => {
  test('ATAQUE: el creador NO inserta su propuesta directo (el conteo es del servidor)', async () => {
    const { error } = await creator.client.from('rehearsal_proposals').insert({
      rehearsal_id: coordRehearsal,
      created_by: creator.id,
      proposed_date: dayInMonth(MONTH, 18),
      start_time: '12:30',
      end_time: '13:35',
      required_confirmations: 1,
    })
    expect(error, 'la tabla no acepta escrituras del cliente').not.toBeNull()
  })

  test('ATAQUE: un integrante NO inserta su voto directo', async () => {
    const { data: proposal } = await admin.from('rehearsal_proposals').insert({
      rehearsal_id: coordRehearsal,
      created_by: creator.id,
      proposed_date: dayInMonth(MONTH, 19),
      start_time: '18:00',
      end_time: '19:30',
      required_confirmations: 99, // no se alcanza nunca en este test
    }).select('id').single()

    const { error } = await memberA.client.from('rehearsal_proposal_votes').insert({
      proposal_id: proposal.id, user_id: memberA.id, vote: 'yes',
    })
    expect(error, 'los votos van por /api/rehearsal/proposal/vote').not.toBeNull()

    // …pero SÍ los lee: ver quién confirmó es la mitad del valor de la votación.
    await admin.from('rehearsal_proposal_votes')
      .insert({ proposal_id: proposal.id, user_id: memberB.id, vote: 'yes' })
    const { data: seen } = await memberA.client
      .from('rehearsal_proposal_votes').select('user_id, vote').eq('proposal_id', proposal.id)
    expect((seen ?? []).length).toBe(1)

    // Y un desconocido no ve ni la propuesta ni los votos.
    const { data: hidden } = await stranger.client
      .from('rehearsal_proposals').select('id').eq('id', proposal.id)
    expect((hidden ?? []).length).toBe(0)
    const { data: hiddenVotes } = await stranger.client
      .from('rehearsal_proposal_votes').select('user_id').eq('proposal_id', proposal.id)
    expect((hiddenVotes ?? []).length).toBe(0)

    await admin.from('rehearsal_proposals').delete().eq('id', proposal.id)
  })

  test('sólo UNA votación abierta por ensayo (índice único parcial)', async () => {
    const base = {
      rehearsal_id: coordRehearsal,
      created_by: creator.id,
      proposed_date: dayInMonth(MONTH, 21),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 99,
    }
    const { data: first, error: e1 } = await admin.from('rehearsal_proposals')
      .insert(base).select('id').single()
    expect(e1).toBeNull()

    const { error: e2 } = await admin.from('rehearsal_proposals')
      .insert({ ...base, proposed_date: dayInMonth(MONTH, 22) })
    expect(e2?.code, 'dos votaciones abiertas no tienen desempate posible').toBe('23505')

    // Cerrada la primera, se puede abrir otra.
    await admin.from('rehearsal_proposals').update({ status: 'cancelled' }).eq('id', first.id)
    const { data: second, error: e3 } = await admin.from('rehearsal_proposals')
      .insert({ ...base, proposed_date: dayInMonth(MONTH, 22) }).select('id').single()
    expect(e3).toBeNull()

    await admin.from('rehearsal_proposals').delete().in('id', [first.id, second.id])
  })

  test('borrar el ensayo se lleva sus propuestas y votos (CASCADE)', async () => {
    // Regresión: el guard `rehearsal_server_only_guard` devolvía `NEW` también
    // en el BEFORE DELETE, donde `NEW` es NULL — y un trigger BEFORE que
    // devuelve NULL CANCELA la operación sin ningún error. Bloqueaba todo
    // borrado, incluido el CASCADE al borrar el ensayo padre.
    const id = await mkRehearsal(creator.id)
    await invite(id, memberA.id, 'accepted')
    const { data: proposal } = await admin.from('rehearsal_proposals').insert({
      rehearsal_id: id,
      created_by: creator.id,
      proposed_date: dayInMonth(MONTH, 26),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 99,
    }).select('id').single()
    await admin.from('rehearsal_proposal_votes')
      .insert({ proposal_id: proposal.id, user_id: memberA.id, vote: 'yes' })

    const { error: delErr } = await admin.from('rehearsals').delete().eq('id', id)
    expect(delErr).toBeNull()

    const { data: orphanProposals } = await admin.from('rehearsal_proposals').select('id').eq('id', proposal.id)
    expect((orphanProposals ?? []).length).toBe(0)
    const { data: orphanVotes } = await admin.from('rehearsal_proposal_votes')
      .select('user_id').eq('proposal_id', proposal.id)
    expect((orphanVotes ?? []).length).toBe(0)
  })

  test('el rango tiene que ser válido (CHECK end_time > start_time)', async () => {
    const { error } = await admin.from('rehearsal_proposals').insert({
      rehearsal_id: coordRehearsal,
      created_by: creator.id,
      proposed_date: dayInMonth(MONTH, 23),
      start_time: '13:00',
      end_time: '12:00',
      required_confirmations: 1,
    })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Flujo completo de votación (por HTTP con la app real)
// ─────────────────────────────────────────────────────────────

test.describe('votación por ruta', () => {
  const needsServer = () => {
    if (!serverUp) test.skip(true, 'requiere npm run dev:web apuntando al stack local')
  }

  test('umbral alcanzado → la fecha se fija y la caducidad se mueve', async () => {
    needsServer()
    const id = await seedRehearsal()
    const date = dayInMonth(MONTH, 8)

    const before = await readRehearsal(id)
    const monthExpiry = new Date(before.expires_at).getTime()

    // El creador abre la votación. Cuenta como confirmado sin votar, así que con
    // required=2 basta un "sí" más.
    const proposal = await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: date,
      start_time: '12:30',
      end_time: '13:35', // minutos no redondos, a propósito
      required_confirmations: 2,
    })

    // Los invitados reciben la notificación; el creador no se la manda a sí mismo.
    const { data: notifs } = await admin.from('notifications')
      .select('user_id, type').eq('type', 'rehearsal_vote')
    const recipients = (notifs ?? []).map((n: any) => n.user_id)
    expect(recipients).toContain(memberA.id)
    expect(recipients).not.toContain(creator.id)
    // Quien rechazó la invitación no participa: tampoco recibe el aviso.
    expect(recipients).not.toContain(rejected.id)

    const voteRes = await api('/api/rehearsal/proposal/vote', memberA.token, {
      proposal_id: proposal.id, vote: 'yes',
    })
    expect(voteRes.status).toBe(200)
    const voteJson = await voteRes.json()
    expect(voteJson.confirmed).toBe(true)

    const after = await readRehearsal(id)
    expect(after.rehearsal_date).toBe(date)
    expect(String(after.rehearsal_time).slice(0, 5)).toBe('12:30')
    // La duración sale del rango votado: 12:30 → 13:35 son 65 minutos.
    expect(after.duration_minutes).toBe(65)
    expect(after.confirmed_at).not.toBeNull()

    // Y la caducidad deja de ser "fin de mes": ahora es 13:35 + 2 h de ese día.
    expect(new Date(after.expires_at).getTime()).not.toBe(monthExpiry)
    expect(new Date(after.expires_at).getTime()).toBe(rehearsalExpiresAt(after)!.getTime())

    // Aviso de fecha fijada a TODO el grupo, hayan votado o no.
    const { data: setNotifs } = await admin.from('notifications')
      .select('user_id').eq('type', 'rehearsal_date_set')
    const notified = (setNotifs ?? []).map((n: any) => n.user_id)
    expect(notified).toContain(memberA.id)
    expect(notified).toContain(memberB.id) // nunca votó
    expect(notified).toContain(creator.id)

    await admin.from('notifications').delete().in('type', ['rehearsal_vote', 'rehearsal_date_set'])
  })

  test('"Fijar ahora" resuelve una votación que no alcanzó el umbral', async () => {
    needsServer()
    const id = await seedRehearsal()

    const proposal = await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 9),
      start_time: '20:00',
      end_time: '21:00',
      required_confirmations: UNREACHABLE, // sin votos queda en 1 de 3
    })

    const resolved = await apiJson('/api/rehearsal/proposal/resolve', creator.token, {
      proposal_id: proposal.id, action: 'fix_now',
    })
    expect(resolved.status, JSON.stringify(resolved.json)).toBe(200)
    expect(resolved.json.confirmed).toBe(true)

    const after = await readRehearsal(id)
    expect(after.rehearsal_date).toBe(dayInMonth(MONTH, 9))
    // Sin esta salida la votación quedaba abierta para siempre y el ensayo nunca
    // llegaba a tener fecha.
    expect(after.duration_minutes).toBe(60)

    await admin.from('notifications').delete().in('type', ['rehearsal_vote', 'rehearsal_date_set'])
  })

  test('un integrante NO puede abrir la votación; un desconocido no puede votar', async () => {
    needsServer()
    const id = await seedRehearsal()

    const asMember = await apiJson('/api/rehearsal/proposal/create', memberA.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 10),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 1,
    })
    expect(asMember.status).toBe(403)
    expect(asMember.json.code).toBe('not_creator')

    const proposal = await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 10),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: UNREACHABLE,
    })

    const asStranger = await apiJson('/api/rehearsal/proposal/vote', stranger.token, {
      proposal_id: proposal.id, vote: 'yes',
    })
    expect(asStranger.status).toBe(403)

    const asRejected = await apiJson('/api/rehearsal/proposal/vote', rejected.token, {
      proposal_id: proposal.id, vote: 'yes',
    })
    expect(asRejected.status).toBe(403)

    await admin.from('notifications').delete().eq('type', 'rehearsal_vote')
  })

  test('cambiar de opinión reemplaza el voto en vez de sumar otro', async () => {
    needsServer()
    const id = await seedRehearsal()
    const proposal = await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 11),
      start_time: '15:00',
      end_time: '16:00',
      required_confirmations: UNREACHABLE, // que no se resuelva sola
    })

    await api('/api/rehearsal/proposal/vote', memberA.token, { proposal_id: proposal.id, vote: 'yes' })
    const second = await apiJson('/api/rehearsal/proposal/vote', memberA.token, { proposal_id: proposal.id, vote: 'no' })
    expect(second.status, JSON.stringify(second.json)).toBe(200)
    expect(second.json.confirmed).toBe(false)

    const { data: votes } = await admin.from('rehearsal_proposal_votes')
      .select('user_id, vote').eq('proposal_id', proposal.id)
    expect((votes ?? []).length).toBe(1)
    expect(votes![0].vote).toBe('no')

    const tally = tallyProposal(votes as any[], UNREACHABLE, 3, creator.id)
    expect(tally.yes).toBe(1) // sólo el creador
    expect(tally.no).toBe(1)

    await admin.from('notifications').delete().eq('type', 'rehearsal_vote')
  })

  test('la fecha propuesta tiene que caer dentro del mes a coordinar', async () => {
    needsServer()
    const id = await seedRehearsal()
    const res = await apiJson('/api/rehearsal/proposal/create', creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(futureMonth(6), 5), // otro mes
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 1,
    })
    expect(res.status, JSON.stringify(res.json)).toBe(400)
    expect(res.json.code).toBe('out_of_month')
  })

  test('no se piden más confirmaciones que integrantes', async () => {
    needsServer()
    const id = await seedRehearsal()
    const res = await apiJson('/api/rehearsal/proposal/create', creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 12),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 50,
    })
    expect(res.status, JSON.stringify(res.json)).toBe(400)
    expect(res.json.code).toBe('threshold_too_high')
  })

  test('un ensayo con fecha ya fijada no admite otra votación', async () => {
    needsServer()
    const id = await seedRehearsal({ rehearsal_date: dayInMonth(MONTH, 13), rehearsal_time: '18:00' })
    const res = await apiJson('/api/rehearsal/proposal/create', creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 14),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 1,
    })
    expect(res.status, JSON.stringify(res.json)).toBe(409)
    expect(res.json.code).toBe('already_settled')
  })

  test('un ensayo que NO es de coordinar no admite votación', async () => {
    needsServer()
    const id = await seedRehearsal({
      date_mode: 'single', coordinate_month: null, rehearsal_date: dayInMonth(MONTH, 15),
    })
    const res = await apiJson('/api/rehearsal/proposal/create', creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 15),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 1,
    })
    expect(res.status, JSON.stringify(res.json)).toBe(409)
    expect(res.json.code).toBe('not_coordinated')
  })

  test('cancelar libera el hueco para proponer otro horario', async () => {
    needsServer()
    const id = await seedRehearsal()
    const proposal = await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 16),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: UNREACHABLE,
    })

    const dup = await apiJson('/api/rehearsal/proposal/create', creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 17),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: UNREACHABLE,
    })
    expect(dup.status, JSON.stringify(dup.json)).toBe(409)
    expect(dup.json.code).toBe('proposal_already_open')

    const cancel = await apiJson('/api/rehearsal/proposal/resolve', creator.token, {
      proposal_id: proposal.id, action: 'cancel',
    })
    expect(cancel.status).toBe(200)

    // Cerrada la primera, el hueco del índice único parcial queda libre.
    await openProposal(creator.token, {
      rehearsal_id: id,
      proposed_date: dayInMonth(MONTH, 17),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: UNREACHABLE,
    })

    await admin.from('notifications').delete().eq('type', 'rehearsal_vote')
  })

  test('votar sobre una votación cuyo horario ya pasó la cierra en vez de fijarla', async () => {
    needsServer()
    // Mes pasado: la propuesta nace vencida. Se siembra con service role porque
    // la ruta de creación —correctamente— no aceptaría una fecha así.
    const pastMonth = futureMonth(-2)
    const id = await mkRehearsal(creator.id, { coordinate_month: pastMonth })
    createdRehearsals.push(id)
    await invite(id, memberA.id, 'accepted')

    const { data: proposal } = await admin.from('rehearsal_proposals').insert({
      rehearsal_id: id,
      created_by: creator.id,
      proposed_date: dayInMonth(pastMonth, 5),
      start_time: '10:00',
      end_time: '11:00',
      required_confirmations: 1, // se alcanzaría de inmediato
    }).select('*').single()

    expect(isProposalStale(proposal)).toBe(true)

    const res = await api('/api/rehearsal/proposal/vote', memberA.token, {
      proposal_id: proposal.id, vote: 'yes',
    })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('proposal_expired')

    const after = await readRehearsal(id)
    // Lo importante: NO se fijó una fecha que ya ocurrió.
    expect(after.rehearsal_date).toBeNull()

    const { data: p } = await admin.from('rehearsal_proposals').select('status').eq('id', proposal.id).single()
    expect(p.status).toBe('expired')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Disponibilidad parcial en la ruta (problema 3)
// ─────────────────────────────────────────────────────────────

test.describe('group-availability', () => {
  const needsServer = () => {
    if (!serverUp) test.skip(true, 'requiere npm run dev:web apuntando al stack local')
  }

  test('devuelve QUIÉNES están libres por hora y los descartes restan', async () => {
    needsServer()
    const id = await seedRehearsal()
    const date = dayInMonth(MONTH, 25)

    const url = `${APP}/api/rehearsal/group-availability?rehearsal_id=${id}&month=${MONTH}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creator.token}` } })
    expect(res.status).toBe(200)
    const json = await res.json()

    // Los miembros incluyen al creador y excluyen al rechazado.
    const memberIds = json.members.map((m: any) => m.id)
    expect(memberIds).toContain(creator.id)
    expect(memberIds).toContain(memberA.id)
    expect(memberIds).toContain(memberB.id)
    expect(memberIds).not.toContain(rejected.id)

    const day = json.calendar.find((d: any) => d.date === date)
    expect(day).toBeTruthy()
    // hour_free indexa DENTRO de members: sin esto el payload del mes sería de
    // cientos de KB con UUIDs.
    const freeAt15 = day.hour_free['15'] ?? []
    expect(freeAt15.length).toBe(json.members.length)
    expect(day.available_hours).toContain(15)

    // memberA descarta las 15:00 de ese día.
    await toggleHourDiscard(memberA.client, id, memberA.id, date, 15, true, false)

    const res2 = await fetch(url, { headers: { Authorization: `Bearer ${creator.token}` } })
    const json2 = await res2.json()
    const day2 = json2.calendar.find((d: any) => d.date === date)

    // Deja de ser un horario "para todos" y pasa a ser parcial: exactamente lo
    // que el segundo panel muestra.
    expect(day2.available_hours).not.toContain(15)
    const idxOfA = json2.members.findIndex((m: any) => m.id === memberA.id)
    expect(day2.hour_free['15']).not.toContain(idxOfA)
    expect((day2.hour_free['15'] ?? []).length).toBe(json2.members.length - 1)
    expect(json2.discards.some((d: any) => d.user_id === memberA.id && d.hour === 15)).toBe(true)

    await admin.from('rehearsal_discards').delete().eq('rehearsal_id', id)
  })

  test('un desconocido recibe 403', async () => {
    needsServer()
    const res = await fetch(
      `${APP}/api/rehearsal/group-availability?rehearsal_id=${coordRehearsal}&month=${MONTH}`,
      { headers: { Authorization: `Bearer ${stranger.token}` } },
    )
    expect(res.status).toBe(403)
  })

  test('acepta Bearer — es como la llama mobile', async () => {
    needsServer()
    const res = await fetch(
      `${APP}/api/rehearsal/group-availability?rehearsal_id=${coordRehearsal}&month=${MONTH}`,
      { headers: { Authorization: `Bearer ${memberA.token}` } },
    )
    // Antes esta ruta usaba createClient() a secas (sólo cookie) y el calendario
    // de mobile habría dado 401 siempre.
    expect(res.status).toBe(200)
  })
})
