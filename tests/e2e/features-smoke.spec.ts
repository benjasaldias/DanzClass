/**
 * Smoke de RENDER con navegador real sobre las cuatro features del lanzamiento
 * (audit.md S7): Chat, Paquetes, Eventos y Ensayos, en claro y en oscuro.
 *
 * Por qué existe: hasta S6 ninguna sesión pudo abrir una pantalla de verdad
 * (S2–S5 dejaron anotada la "verificación visual pendiente"). El defecto que más
 * caro salió del audit —P0-3(a), la pantalla de evento de mobile que crasheaba
 * siempre por un `size` inválido— era invisible para el typecheck del lado en
 * que ocurría y para cualquier prueba de datos: sólo aparece al RENDERIZAR. Esta
 * suite no valida negocio (de eso se ocupa tests/integration/features-qa.spec.ts):
 * valida que cada pantalla monte, muestre lo suyo y no tire errores de consola.
 *
 * Siembra sus propios usuarios y datos con service role contra el stack local, y
 * entra por el formulario de login real.
 *
 * Requisitos:
 *   npm run db:start   (stack local)
 *   npm run dev:web    (Next en :3000, apuntando al stack local)
 * Correr con:
 *   npx playwright test tests/e2e/features-smoke.spec.ts
 */

import { test, expect, Page } from '@playwright/test'
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const stamp = Date.now()
const PASSWORD = 'Test1234!'

const seeded = {
  teacherEmail: '', studentEmail: '',
  teacherId: '', studentId: '',
  classId: '', eventId: '', rehearsalId: '', chatId: '',
  coordRehearsalId: '', coordMonth: '',
}

async function mkUser(prefix: string) {
  const email = `${prefix}-${stamp}@smoke.local`
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
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

// `next dev` compila cada ruta la primera vez que se pide: sin este margen, el
// primer login se come 20 s esperando a que compile /feed.
test.setTimeout(120_000)

test.beforeAll(async () => {
  // En un hook, el margen se fija desde adentro (el `setTimeout` de arriba sólo
  // aplica a los tests).
  test.setTimeout(180_000)
  const teacher = await mkUser('smokeprof')
  const student = await mkUser('smokealu')
  seeded.teacherEmail = teacher.email
  seeded.studentEmail = student.email
  seeded.teacherId = teacher.id
  seeded.studentId = student.id

  // El profesor necesita plan para las pantallas que lo exigen.
  await admin.from('subscriptions').insert({
    user_id: teacher.id, tier: 'pro', status: 'active',
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  })

  const base = {
    teacher_id: teacher.id, dance_style: 'House', type: 'suelta',
    time: '20:00', duration_minutes: 60, max_spots: 10, city: 'Santiago', status: 'active',
  }
  seeded.classId = await ins('classes', { ...base, title: '[SMOKE] Clase con paquete', date: '2027-08-01', price: 12000 })
  const classB = await ins('classes', { ...base, title: '[SMOKE] Segunda del paquete', date: '2027-08-02', price: 12000 })

  const pkgId = await ins('class_packages', { teacher_id: teacher.id, title: '[SMOKE] Paquete 2 clases', price: 20000 })
  await admin.from('class_package_items').insert([
    { package_id: pkgId, class_id: seeded.classId },
    { package_id: pkgId, class_id: classB },
  ])

  await ins('enrollments', { class_id: seeded.classId, student_id: student.id, status: 'confirmed' })

  seeded.chatId = await ins('chats', { type: 'class', class_id: seeded.classId, student_id: student.id })
  await admin.from('chat_participants').insert([
    { chat_id: seeded.chatId, user_id: student.id },
    { chat_id: seeded.chatId, user_id: teacher.id },
  ])
  await admin.from('chat_messages').insert({ chat_id: seeded.chatId, sender_id: teacher.id, content: 'Hola, nos vemos en clase' })

  seeded.eventId = await ins('events', {
    creator_id: teacher.id, title: '[SMOKE] Batalla', event_type: 'batalla',
    event_date: '2027-09-01', city: 'Santiago', has_entry: true, entry_price: 5000,
    has_spots: true, max_spots: 50, status: 'active',
  })

  seeded.rehearsalId = await ins('rehearsals', {
    creator_id: teacher.id, title: '[SMOKE] Ensayo', city: 'Santiago',
    date_mode: 'single', rehearsal_date: '2027-09-05', rehearsal_time: '19:00', status: 'active',
  })
  await ins('rehearsal_invites', { rehearsal_id: seeded.rehearsalId, user_id: student.id, status: 'accepted' })

  // Ensayo `coordinate` para el calendario de coordinación (077). Mes a futuro
  // para que no caduque durante el test.
  const coordMonth = (() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + 2)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  seeded.coordMonth = coordMonth
  seeded.coordRehearsalId = await ins('rehearsals', {
    creator_id: teacher.id, title: '[SMOKE] Ensayo a coordinar', city: 'Santiago',
    date_mode: 'coordinate', coordinate_month: coordMonth, status: 'active',
  })
  await ins('rehearsal_invites', { rehearsal_id: seeded.coordRehearsalId, user_id: student.id, status: 'accepted' })

  // Precompila las rutas en el dev server para que los tiempos de espera midan
  // la app y no al bundler.
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
  await Promise.all(
    ['/auth/login', '/feed', '/chats', `/chat/${seeded.chatId}`, `/class/${seeded.classId}`,
      `/event/${seeded.eventId}`, `/rehearsal/${seeded.rehearsalId}`, '/my-classes']
      .map((path) => fetch(`${baseUrl}${path}`).catch(() => {})),
  )
})

/** Errores de consola que no dependen del código de la app. */
function isNoise(text: string): boolean {
  // Extensiones del navegador/IDE que se inyectan en la página (p. ej. Console
  // Ninja carga un SVG `data:` que la CSP bloquea, con razón): no es la app.
  if (/Loading plugin data from 'data:/.test(text)) return true
  // `HotReload` y `ReactDevOverlay` sólo existen en `next dev`.
  if (/HotReload|ReactDevOverlay/.test(text)) return true
  // El websocket de HMR de `next dev` (ws://localhost:<puerto aleatorio>) no
  // existe en producción; desde S7 la CSP de dev lo permite, pero el filtro se
  // conserva por si el puerto cambia de forma.
  if (/Content Security Policy/i.test(text) && /ws:\/\/localhost:\d+/.test(text)) return true
  return /Download the React DevTools|Fast Refresh|hydrat|preload|favicon|net::ERR_|Failed to load resource/i.test(text)
}

async function login(page: Page, email: string, userId: string) {
  // El tour de onboarding se monta sobre el feed en cuentas de menos de 24 h y
  // tapa la pantalla: se marca como visto igual que lo haría el usuario.
  await page.addInitScript((uid) => {
    window.localStorage.setItem(`danzclass_onboarding_v1_seen:${uid}`, '1')
  }, userId)
  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  // `commit` en vez del evento `load`: en dev el feed tarda en terminar de
  // cargar y lo único que hace falta acá es que la navegación haya ocurrido.
  await page.waitForURL(/\/(feed|agenda|my-classes|explore)/, { timeout: 60_000, waitUntil: 'commit' })
  // El login hace `router.push` + `router.refresh()`: navegar antes de que ese
  // refresh termine aborta la navegación siguiente (ERR_ABORTED). Esperar a que
  // el shell autenticado esté montado alcanza.
  await page.getByRole('link', { name: 'Notificaciones' }).waitFor({ timeout: 60_000 })
}

/** `goto` tolerante a la navegación que el router de Next pueda estar haciendo. */
async function gotoStable(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      return
    } catch (err: any) {
      if (!/ERR_ABORTED|frame was detached/.test(String(err?.message)) || attempt === 2) throw err
      await page.waitForTimeout(1_000)
    }
  }
}

/** Abre una ruta y falla si la pantalla no monta o si la consola escupe errores. */
async function visit(page: Page, path: string, expectText: RegExp | string) {
  const errors: string[] = []
  const onConsole = (msg: any) => { if (msg.type() === 'error' && !isNoise(msg.text())) errors.push(msg.text()) }
  const onPageError = (err: Error) => errors.push(`pageerror: ${err.message}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  // `domcontentloaded` y no `networkidle`: el chat abre un websocket de Realtime
  // que nunca deja la red en reposo.
  await gotoStable(page, path)
  if (page.url().includes('/auth/login')) {
    // La cookie de sesión se escribe justo después del push del login: un
    // segundo intento evita esa carrera sin ocultar un fallo real de sesión.
    await gotoStable(page, path)
  }
  expect(page.url()).toContain(path)
  await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 15_000 })

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  expect(errors, `errores de consola en ${path}`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`tema ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      // next-themes lee `theme` de localStorage antes del primer render.
      await page.addInitScript((t) => window.localStorage.setItem('theme', t), theme)
    })

    test('alumno: chat, lista de chats, clase con paquete, evento y ensayo', async ({ page }) => {
      await login(page, seeded.studentEmail, seeded.studentId)

      await visit(page, '/chats', 'Mensajes')
      await visit(page, `/chat/${seeded.chatId}`, 'Hola, nos vemos en clase')
      await visit(page, `/class/${seeded.classId}`, '[SMOKE] Clase con paquete')
      await expect(page.getByText('Paquetes disponibles')).toBeVisible()
      await visit(page, `/event/${seeded.eventId}`, '[SMOKE] Batalla')
      await expect(page.getByText(/Entrada:/)).toBeVisible()
      await visit(page, `/rehearsal/${seeded.rehearsalId}`, '[SMOKE] Ensayo')
      await expect(page.getByText('Integrantes')).toBeVisible()
      await visit(page, `/rehearsal/${seeded.coordRehearsalId}`, '[SMOKE] Ensayo a coordinar')
      await expect(page.getByText('Coordinar fecha y hora')).toBeVisible()
    })

    test('profesor: mis clases, evento propio y ensayo propio', async ({ page }) => {
      await login(page, seeded.teacherEmail, seeded.teacherId)

      await visit(page, '/my-classes', /Clases que dicto|Clases que tomo/)
      await visit(page, `/event/${seeded.eventId}`, '[SMOKE] Batalla')
      await expect(page.getByRole('button', { name: /Invitar profesor/ })).toBeVisible()
      await visit(page, `/rehearsal/${seeded.rehearsalId}`, '[SMOKE] Ensayo')
    })
  })
}

test('el chat envía y muestra el mensaje al instante', async ({ page }) => {
  await login(page, seeded.studentEmail, seeded.studentId)
  await gotoStable(page, `/chat/${seeded.chatId}`)

  const text = `mensaje smoke ${Date.now()}`
  const input = page.getByPlaceholder('Escribe un mensaje...')
  const send = page.getByRole('button', { name: 'Enviar mensaje' })

  // El chat es un client component: hasta que React hidrata, `fill` sólo escribe
  // en el DOM y el estado del componente sigue vacío — el botón queda
  // deshabilitado y Enter no dispara nada. Rellenar hasta que el botón se
  // habilite es la señal de que la página ya responde de verdad.
  await expect(async () => {
    // `fill` sobre un input que ya tiene el mismo valor no vuelve a notificar a
    // React, así que el reintento tiene que vaciar y teclear de nuevo.
    await input.fill('')
    await input.pressSequentially(text, { delay: 10 })
    await expect(send).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 45_000 })

  await send.click()

  // Antes de S7 el mensaje sólo aparecía si Realtime lo devolvía, y la tabla no
  // estaba en la publicación: el remitente no veía nada hasta recargar.
  await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('No se pudo enviar el mensaje. Intenta de nuevo.')).toHaveCount(0)
})

test('coordinación de ensayo: descartar un día, ver el panel parcial y abrir una votación', async ({ page }) => {
  await login(page, seeded.teacherEmail, seeded.teacherId)
  await gotoStable(page, `/rehearsal/${seeded.coordRehearsalId}`)

  // El calendario es un import dinámico que además pide
  // /api/rehearsal/group-availability: en `next dev` la primera visita paga la
  // compilación de las dos cosas. Timeouts generosos por el mismo motivo por el
  // que `login()` usa 60 s, no porque la pantalla sea lenta en producción.
  await expect(page.getByText('Coordinar fecha y hora')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/\d+ integrantes?/)).toBeVisible({ timeout: 60_000 })

  // Un día cualquiera del mes coordinado (el 15 existe en todos los meses).
  // El calendario es un client component: hasta que React hidrata, el click no
  // tiene handler y no pasa nada — el mismo problema que el chat documenta más
  // arriba. Pero el día es un TOGGLE, así que reintentar a ciegas lo puede
  // volver a cerrar: cada intento comprueba primero si ya está abierto.
  const day15 = page.getByRole('button', { name: /^15 de / })
  const panel0Title = page.getByText(/Horarios libres para todos el 15/)
  await expect(async () => {
    if (await panel0Title.isVisible()) return
    await day15.click()
    await expect(panel0Title).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 60_000 })

  // Panel 1: disponibilidad parcial. El problema (3) era justamente que no había
  // forma de llegar acá. Las pestañas no son toggles, pero el deslizador tiene
  // una transición de 300 ms: reintentar es inofensivo y cubre el caso en que el
  // click llegue antes de que el panel esté montado.
  const tabParciales = page.getByRole('button', { name: /Parciales/ })
  const tabTodos = page.getByRole('button', { name: /Para todos/ })
  await expect(async () => {
    await tabParciales.click()
    await expect(page.getByText(/Horarios parciales el 15/)).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })

  // Hover sobre un horario → quiénes están disponibles. El bloque vive FUERA del
  // deslizador porque como tooltip flotante lo recortaba su `overflow-hidden`;
  // esta aserción es la que impide que vuelva a moverse adentro.
  await expect(async () => {
    await tabTodos.click()
    await expect(page.getByText(/Horarios libres para todos el 15/)).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  const hourChip = page.getByTitle('Descartar este horario').first()
  await expect(hourChip).toBeVisible({ timeout: 10_000 })
  await hourChip.hover()
  await expect(page.getByText('Disponibles', { exact: true })).toBeVisible()
  const reveal = page.getByText(/^\d{2}:00 · \d+ de \d+$/)
  await expect(reveal).toBeVisible()
  // Visible de verdad, no recortado a 0 px de alto por un contenedor padre.
  const box = await reveal.boundingBox()
  expect(box!.height).toBeGreaterThan(0)

  // Descartar el día completo y verificar que el propio chip lo refleja.
  await page.getByRole('button', { name: 'Descartar día' }).click()
  await expect(page.getByRole('button', { name: 'Recuperar día' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Descartaron el día completo')).toBeVisible()

  // Recuperarlo deja el calendario como estaba.
  await page.getByRole('button', { name: 'Recuperar día' }).click()
  await expect(page.getByRole('button', { name: 'Descartar día' })).toBeVisible({ timeout: 15_000 })

  // Iniciar una votación desde un horario libre para todos.
  const vote = page.getByTitle('Iniciar votación en este horario').first()
  await expect(vote).toBeVisible({ timeout: 10_000 })
  await vote.click()
  await expect(page.getByText(/Iniciar votación · 15 de/)).toBeVisible()

  // Rango con minutos no redondos: el caso que el usuario pidió explícitamente.
  const [from, to] = await page.locator('input[type="time"]').all()
  await from.fill('12:30')
  await to.fill('13:35')
  await page.getByRole('button', { name: /Iniciar votación \(12:30 a 13:35/ }).click()

  await expect(page.getByText(/Votación abierta · 15 de/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('12:30 a 13:35 (1 h 5 min)')).toBeVisible()
  // El creador cuenta como confirmado sin votar, y tiene las dos salidas manuales.
  await expect(page.getByRole('button', { name: /Fijar ahora/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible()

  // Fijar la fecha cambia la tarjeta "Cuándo y dónde" del ensayo.
  await page.getByRole('button', { name: /Fijar ahora/ }).click()
  await expect(page.getByText(/Fecha fijada: 15 de/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/\(fecha fijada\)/)).toBeVisible({ timeout: 20_000 })
})
