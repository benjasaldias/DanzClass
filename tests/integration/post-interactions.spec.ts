/**
 * Integración (stack local Docker) — "me gusta" y "¡Enséñala!" sobre videos
 * (076_post_interactions.sql).
 *
 * Las dos interacciones se defienden en capas distintas y por eso se prueban
 * las dos:
 *
 *   · post_likes          → lo escribe el CLIENTE. Toda la defensa es RLS +
 *                           triggers, así que acá se prueba la RLS con un JWT
 *                           real (mismo camino que un PATCH a PostgREST desde
 *                           el navegador), no con service role.
 *   · post_teach_requests → no acepta escrituras del cliente. La defensa vive
 *                           en /api/post/teach-request, que es lo que prueban
 *                           los bloques `needsServer`.
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
  const email = `${prefix}-${stamp}@pitest.local`
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

async function givePlan(userId: string, tier = 'pro') {
  await admin.from('subscriptions').insert({
    user_id: userId,
    tier,
    status: 'active',
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    mp_subscription_id: `mp_pi_${userId.slice(0, 8)}_${stamp}`,
  })
}

async function mkPost(userId: string, row: Record<string, any> = {}): Promise<string> {
  const { data, error } = await admin.from('posts').insert({
    user_id: userId,
    title: `[TEST] video ${stamp}`,
    visibility: 'public',
    is_public: true,
    ...row,
  }).select('id').single()
  if (error) throw new Error(`seed posts: ${error.message}`)
  return data.id
}

async function counters(postId: string): Promise<{ likes: number; requests: number }> {
  const { data } = await admin
    .from('posts')
    .select('likes_count, teach_requests_count')
    .eq('id', postId)
    .single()
  return { likes: Number(data.likes_count), requests: Number(data.teach_requests_count) }
}

async function api(path: string, token: string, body: unknown): Promise<Response> {
  return fetch(`${APP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

let author: User
let viewer: User
let stranger: User
let publicPost: string
let teachablePost: string
let privatePost: string

test.beforeAll(async () => {
  author = await mkUser('piautor')
  viewer = await mkUser('piview')
  stranger = await mkUser('piotro')
  // Publicar videos exige plan activo (trigger de 060).
  await givePlan(author.id)

  publicPost = await mkPost(author.id)
  teachablePost = await mkPost(author.id, { allow_teach_requests: true })
  privatePost = await mkPost(author.id, { visibility: 'friends', is_public: false, allow_teach_requests: true })

  serverUp = await fetch(`${APP}/api/health`).then(() => true).catch(() => false)
  if (!serverUp) {
    // /api/health puede no existir: basta con que el puerto responda algo.
    serverUp = await fetch(APP).then(() => true).catch(() => false)
  }
})

test.afterAll(async () => {
  await admin.from('posts').delete().in('id', [publicPost, teachablePost, privatePost])
  for (const u of [author, viewer, stranger]) {
    if (u) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

// ─────────────────────────────────────────────────────────────
// "Me gusta" — escritura del cliente, defendida por RLS
// ─────────────────────────────────────────────────────────────

test.describe('post_likes', () => {
  test('dar y quitar like mantiene el contador del post', async () => {
    const { error: likeErr } = await viewer.client
      .from('post_likes')
      .insert({ post_id: publicPost, user_id: viewer.id })
    expect(likeErr).toBeNull()
    expect((await counters(publicPost)).likes).toBe(1)

    const { error: unlikeErr } = await viewer.client
      .from('post_likes')
      .delete()
      .eq('post_id', publicPost)
      .eq('user_id', viewer.id)
    expect(unlikeErr).toBeNull()
    expect((await counters(publicPost)).likes).toBe(0)
  })

  test('no se puede dar like en nombre de otro', async () => {
    const { error } = await viewer.client
      .from('post_likes')
      .insert({ post_id: publicPost, user_id: stranger.id })
    expect(error).not.toBeNull()
    expect((await counters(publicPost)).likes).toBe(0)
  })

  test('no se puede dar like a un video que no se puede ver', async () => {
    // `privatePost` es visibility='friends' y viewer no es amigo del autor.
    const { error } = await stranger.client
      .from('post_likes')
      .insert({ post_id: privatePost, user_id: stranger.id })
    expect(error).not.toBeNull()
    expect((await counters(privatePost)).likes).toBe(0)
  })

  test('el autor no puede inflar likes_count con un PATCH directo', async () => {
    // `posts_update` (008) es FOR UPDATE ... USING sin WITH CHECK: la fila es
    // suya, así que el UPDATE pasa. Lo que lo detiene es posts_counters_guard,
    // que revierte la columna en silencio.
    const { error } = await author.client
      .from('posts')
      .update({ likes_count: 9999, teach_requests_count: 9999 })
      .eq('id', publicPost)
    expect(error).toBeNull()
    const after = await counters(publicPost)
    expect(after.likes).toBe(0)
    expect(after.requests).toBe(0)
  })

  test('un video no cambia de autor', async () => {
    const { error } = await author.client
      .from('posts')
      .update({ user_id: stranger.id })
      .eq('id', publicPost)
    expect(error).not.toBeNull()
    const { data } = await admin.from('posts').select('user_id').eq('id', publicPost).single()
    expect(data.user_id).toBe(author.id)
  })

  test('el autor sí puede seguir editando lo suyo (título, visibilidad, allow_teach_requests)', async () => {
    const { error } = await author.client
      .from('posts')
      .update({ title: '[TEST] video editado', allow_teach_requests: true })
      .eq('id', publicPost)
    expect(error).toBeNull()
    const { data } = await admin
      .from('posts').select('title, allow_teach_requests').eq('id', publicPost).single()
    expect(data.title).toBe('[TEST] video editado')
    expect(data.allow_teach_requests).toBe(true)
    // Se deja como estaba para no contaminar los casos de "¡Enséñala!".
    await admin.from('posts').update({ allow_teach_requests: false }).eq('id', publicPost)
  })
})

// ─────────────────────────────────────────────────────────────
// "¡Enséñala!" — sólo por la ruta
// ─────────────────────────────────────────────────────────────

test.describe('post_teach_requests', () => {
  test('el cliente no escribe la tabla directo', async () => {
    const { error } = await viewer.client
      .from('post_teach_requests')
      .insert({ post_id: teachablePost, user_id: viewer.id })
    expect(error).not.toBeNull()
    expect((await counters(teachablePost)).requests).toBe(0)
  })

  test('nace deshabilitado: allow_teach_requests por defecto es false', async () => {
    const { data } = await admin.from('posts').select('allow_teach_requests').eq('id', publicPost).single()
    expect(data.allow_teach_requests).toBe(false)
  })

  test('pedir, repetir y sacar el pedido — con un solo aviso al autor', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')

    const add = await api('/api/post/teach-request', viewer.token, { postId: teachablePost, action: 'add' })
    expect(add.status).toBe(200)
    expect(await add.json()).toMatchObject({ ok: true, requested: true, count: 1 })

    // Idempotente: pedir dos veces no duplica la fila ni el aviso.
    const again = await api('/api/post/teach-request', viewer.token, { postId: teachablePost, action: 'add' })
    expect((await again.json()).count).toBe(1)

    const { data: notifs } = await admin
      .from('notifications')
      .select('id, data')
      .eq('user_id', author.id)
      .eq('type', 'teach_request')
    expect(notifs).toHaveLength(1)
    expect(notifs[0].data.post_id).toBe(teachablePost)
    expect(notifs[0].data.from_user_id).toBe(viewer.id)

    const remove = await api('/api/post/teach-request', viewer.token, { postId: teachablePost, action: 'remove' })
    expect(await remove.json()).toMatchObject({ requested: false, count: 0 })
    expect((await counters(teachablePost)).requests).toBe(0)
  })

  test('un video sin "¡Enséñala!" habilitado rechaza el pedido', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    const res = await api('/api/post/teach-request', viewer.token, { postId: publicPost, action: 'add' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('teach_requests_disabled')
  })

  test('el autor no se pide a sí mismo', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    const res = await api('/api/post/teach-request', author.token, { postId: teachablePost, action: 'add' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('own_post')
  })

  test('no se pide sobre un video que no se puede ver', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    const res = await api('/api/post/teach-request', stranger.token, { postId: privatePost, action: 'add' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('post_not_visible')
  })

  test('sin sesión no se pide nada', async () => {
    test.skip(!serverUp, 'necesita `npm run dev:web`')
    const res = await fetch(`${APP}/api/post/teach-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: teachablePost, action: 'add' }),
    })
    expect(res.status).toBe(401)
  })
})
