import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { deleteCloudinaryAssets } from '@/lib/cloudinary-admin'
import { receiptStoragePath } from '@/lib/receipts'
import { notifyUsers, type NotifyRow } from '@/lib/notifyUsers'
import { lastSessionEnd } from '@danceclass/shared'

// Vercel Cron runs this daily at 03:00 UTC.
// Deletes class-media storage files + class_media rows + payment-receipt files
// for classes whose deletion date has passed.

export const runtime = 'nodejs'

async function pingHealthcheck(uuid: string | undefined) {
  if (!uuid) return
  try {
    await fetch(`https://hc-ping.com/${uuid}`, { signal: AbortSignal.timeout(5000) })
  } catch {
    // non-critical — never fail the cron because of a missed ping
  }
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    logger.error('cleanup-classes', 'CRON_SECRET not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // D-6: el cron corre en UTC. Para los recordatorios "mañana en Chile" usamos
  // un offset estable (Chile: UTC-3 en verano, UTC-4 en invierno).
  // Calculamos "now" en wall-clock chileno usando Intl.DateTimeFormat con la zona.
  // Esto evita que un cron a 03:00 UTC en verano (= 00:00 Chile) entienda mal "mañana".
  function chileNow(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`)
  }
  const chileToday = chileNow()

  let deleted = 0
  let errors: string[] = []

  // ── Archivado a Historial: 24 h después de la última sesión (item 1) ─────────
  // Una clase cuya última sesión terminó hace más de 24 h pasa a estado
  // 'archived': se le quita el contenido pesado (class_media en Storage) y su
  // página /class deja de existir (404). Solo persiste como tarjeta en el
  // Historial (enrollments/payments se conservan). Las clases indefinidas
  // (ends_indefinitely) nunca se archivan porque no tienen "última sesión".
  const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000
  // P2-5: sin paginar, PostgREST corta en 1000 filas por defecto — con más
  // clases activas que eso, las siguientes ni se listaban ni se archivaban,
  // en silencio (sin error). `.range()` en loop cubre cualquier volumen.
  const CLASS_PAGE_SIZE = 500
  const activeClasses: any[] = []
  for (let page = 0; ; page++) {
    const { data: pageData, error: pageErr } = await (supabase as any)
      .from('classes')
      .select('id, type, date, time, recurrence, custom_dates, recurring_time, duration_minutes, ends_at, ends_indefinitely, class_media(*)')
      .in('status', ['active', 'completed'])
      .range(page * CLASS_PAGE_SIZE, page * CLASS_PAGE_SIZE + CLASS_PAGE_SIZE - 1)
    if (pageErr) {
      logger.error('cleanup-classes:fetch-active-classes', pageErr, { page })
      break
    }
    if (!pageData || pageData.length === 0) break
    activeClasses.push(...pageData)
    if (pageData.length < CLASS_PAGE_SIZE) break
  }

  for (const cls of activeClasses) {
    const end = lastSessionEnd(cls)
    if (!end) continue
    if (now.getTime() <= end.getTime() + ARCHIVE_GRACE_MS) continue
    const { error } = await archiveClass(supabase, cls)
    if (error) errors.push(`class ${cls.id}: ${error}`)
    else deleted++
  }

  logger.info('cleanup-classes:archived', { archived: deleted, errors: errors.length })

  // ── Recordatorios 24h antes ─────────────────────────────────────────────────
  // D-6: "mañana" siempre en hora Chile, no UTC. Evita perder/duplicar recordatorios cerca de medianoche.
  const tomorrow = new Date(chileToday)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  let reminders = 0

  // Collect all (class_id, student_id, session_time) tuples that need a reminder
  const reminderTargets: { class_id: string; title: string; teacher_username: string; session_time: string; student_ids: string[] }[] = []

  // 1. Clases suelta con session_date = mañana
  const { data: sueltas24 } = await supabase
    .from('classes')
    .select('id, title, time, teacher:profiles!teacher_id(username), enrollments(student_id, status)')
    .eq('type', 'suelta')
    .eq('date', tomorrowStr)
    .eq('status', 'active') as any

  for (const c of sueltas24 ?? []) {
    const confirmed = (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').map((e: any) => e.student_id)
    if (confirmed.length > 0) {
      reminderTargets.push({ class_id: c.id, title: c.title, teacher_username: c.teacher?.username ?? '', session_time: c.time ?? '', student_ids: confirmed })
    }
  }

  // 2. Clases con class_sessions para mañana (periódicas con sesiones explícitas)
  const { data: sessions24 } = await supabase
    .from('class_sessions')
    .select('class_id, class:classes(id, title, status, teacher:profiles!teacher_id(username), enrollments(student_id, status))')
    .eq('date', tomorrowStr) as any

  for (const s of sessions24 ?? []) {
    const c = s.class
    if (!c || c.status !== 'active') continue
    const confirmed = (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').map((e: any) => e.student_id)
    if (confirmed.length > 0) {
      reminderTargets.push({ class_id: c.id, title: c.title, teacher_username: c.teacher?.username ?? '', session_time: c.recurring_time ?? '', student_ids: confirmed })
    }
  }

  // 3. Clases custom: filtra en JS
  const { data: customClasses24 } = await supabase
    .from('classes')
    .select('id, title, recurring_time, custom_dates, teacher:profiles!teacher_id(username), enrollments(student_id, status)')
    .eq('recurrence', 'custom')
    .eq('status', 'active') as any

  for (const c of customClasses24 ?? []) {
    if (!(c.custom_dates as string[] ?? []).includes(tomorrowStr)) continue
    const confirmed = (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').map((e: any) => e.student_id)
    if (confirmed.length > 0) {
      reminderTargets.push({ class_id: c.id, title: c.title, teacher_username: c.teacher?.username ?? '', session_time: c.recurring_time ?? '', student_ids: confirmed })
    }
  }

  // 4. Clases periódicas sin sesiones explícitas: calcular si mañana es día de clase
  const { data: periodicas24 } = await supabase
    .from('classes')
    .select('id, title, recurring_time, start_date, recurrence, ends_at, ends_indefinitely, teacher:profiles!teacher_id(username), enrollments(student_id, status)')
    .in('type', ['periodica', 'entrenamiento'])
    .eq('status', 'active')
    .neq('recurrence', 'custom') as any

  for (const c of periodicas24 ?? []) {
    if (!c.start_date) continue
    // Parse YYYY-MM-DD safely (local time)
    const [sy, sm, sd] = (c.start_date as string).split('-').map(Number)
    const start = new Date(sy, sm - 1, sd)
    const diff = Math.round((tomorrow.getTime() - start.getTime()) / 86400000)
    if (diff < 0) continue
    let isClassDay = false
    if (c.recurrence === 'weekly') isClassDay = diff % 7 === 0
    else if (c.recurrence === 'biweekly') isClassDay = diff % 14 === 0
    else if (c.recurrence === 'monthly') isClassDay = start.getDate() === tomorrow.getDate()
    if (!isClassDay) continue

    const confirmed = (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').map((e: any) => e.student_id)
    if (confirmed.length > 0) {
      reminderTargets.push({ class_id: c.id, title: c.title, teacher_username: c.teacher?.username ?? '', session_time: c.recurring_time ?? '', student_ids: confirmed })
    }
  }

  // Deduplicate by class_id (in case sessions + periodica overlap)
  const seen = new Set<string>()
  const dedupedTargets = reminderTargets.filter((t) => {
    if (seen.has(t.class_id)) return false
    seen.add(t.class_id)
    return true
  })

  // Fetch existing class_reminder notifications sent today to avoid duplicates
  const todayStr = today
  const { data: existingReminders } = await supabase
    .from('notifications')
    .select('user_id, data')
    .eq('type', 'class_reminder')
    .gte('created_at', `${todayStr}T00:00:00.000Z`) as any

  const alreadySent = new Set<string>(
    (existingReminders ?? []).map((n: any) => `${n.user_id}:${(n.data as any)?.class_id}`)
  )

  for (const target of dedupedTargets) {
    const newNotifs = target.student_ids
      .filter((sid) => !alreadySent.has(`${sid}:${target.class_id}`))
      .map((sid) => ({
        user_id: sid,
        type: 'class_reminder' as const,
        data: {
          class_id: target.class_id,
          class_title: target.title,
          teacher_username: target.teacher_username,
          session_date: tomorrowStr,
          session_time: target.session_time,
        },
      }))

    if (newNotifs.length > 0) {
      await notifyUsers(supabase, newNotifs)
      reminders += newNotifs.length
    }
  }

  logger.info('cleanup-classes:reminders', { reminders })

  // ── 2x stale enrollment timeout: cancel after 7 days of non-payment ─────────
  // P0-4: el reloj mide desde `pending_since` (cuándo la fila ENTRÓ a
  // pending_payment, mantenido por el trigger `enrollments_write_guard` de la
  // migración 066), no `created_at` (cuándo se creó la inscripción). Un pago
  // rechazado o un match reasignado reinician el estado sin tocar `created_at`,
  // así que usar esa columna cancelaba reservas que llevaban minutos esperando.
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: stale2x } = await (supabase as any)
    .from('enrollments')
    .select('id, student_id, class_id, partner_enrollment_id')
    .eq('is_2x', true)
    .eq('status', 'pending_payment')
    .lt('pending_since', sevenDaysAgo.toISOString())

  let cancelled2x = 0
  for (const e of stale2x ?? []) {
    // Cancel this enrollment and void its pending payments
    await supabase
      .from('enrollments')
      .update({ status: 'cancelled' } as any)
      .eq('id', e.id)
    await (supabase as any)
      .from('payments')
      .update({ status: 'void' })
      .eq('enrollment_id', e.id)
      .not('status', 'in', '("verified","void")')

    // Cancel partner enrollment too (if it exists and is also pending)
    if (e.partner_enrollment_id) {
      const { data: partner } = await supabase
        .from('enrollments')
        .select('id, student_id, status')
        .eq('id', e.partner_enrollment_id)
        .maybeSingle()
      if (partner && partner.status === 'pending_payment') {
        await supabase
          .from('enrollments')
          .update({ status: 'cancelled' } as any)
          .eq('id', partner.id)
        await (supabase as any)
          .from('payments')
          .update({ status: 'void' })
          .eq('enrollment_id', partner.id)
          .not('status', 'in', '("verified","void")')

        await notifyUsers(supabase, [{
          user_id: partner.student_id,
          type: 'class_cancelled',
          data: { class_id: e.class_id, reason: '2x_payment_timeout' },
        }])
      }
    }

    await notifyUsers(supabase, [{
      user_id: e.student_id,
      type: 'class_cancelled',
      data: { class_id: e.class_id, reason: '2x_payment_timeout' },
    }])

    cancelled2x++
  }

  if (cancelled2x > 0) logger.info('cleanup-classes:2x', { cancelled2x })

  // ── Holds de cupo vencidos (item 3): clases sin pagos atrasados ──────────────
  // El cupo ya se liberó a nivel de la vista class_spots al expirar el hold; acá
  // solo hacemos la limpieza: cancelar la inscripción reservada nunca pagada y
  // anular su pago pendiente. Solo toca pending_payment con hold vencido.
  const { data: expiredHolds } = await (supabase as any)
    .from('enrollments')
    .select('id')
    .eq('status', 'pending_payment')
    .not('hold_expires_at', 'is', null)
    .lt('hold_expires_at', now.toISOString())

  // P2-3: batch en vez de un round-trip por fila.
  const expiredHoldIds = (expiredHolds ?? []).map((e: any) => e.id)
  const releasedHolds = expiredHoldIds.length
  if (expiredHoldIds.length > 0) {
    await supabase.from('enrollments').update({ status: 'cancelled' } as any).in('id', expiredHoldIds)
    await (supabase as any)
      .from('payments')
      .update({ status: 'void' })
      .in('enrollment_id', expiredHoldIds)
      .not('status', 'in', '("verified","void")')
    logger.info('cleanup-classes:holds', { releasedHolds })
  }

  // ── P1-1: auto-cancelar reservas impagas sin hold tras 72h ───────────────────
  // Una inscripción pending_payment (reservada, comprobante nunca subido) que no
  // es 2x ni tiene hold temporal ocupa el cupo indefinidamente, dejando clases
  // "llenas" de gente que nunca pagó. El payment_reminder de 24h ya avisó; a las
  // 72h liberamos el cupo. Al subir un comprobante el estado pasa a
  // 'payment_submitted', así que esto solo alcanza reservas nunca concretadas.
  // (Los holds de allow_late_payment=false se limpian arriba; las de 2x tienen
  // su propio timeout de 7 días.)
  const STALE_PENDING_MS = 72 * 60 * 60 * 1000
  const stalePendingCutoff = new Date(now.getTime() - STALE_PENDING_MS)
  const { data: stalePending } = await (supabase as any)
    .from('enrollments')
    .select('id, student_id, class_id, is_2x, class:classes(title, status, type)')
    .eq('status', 'pending_payment')
    .is('hold_expires_at', null)
    .lt('pending_since', stalePendingCutoff.toISOString())

  // Solo pending sin hold, no 2x (tiene su timeout de 7 días), en clases activas.
  //
  // Los ENTRENAMIENTOS quedan fuera (audit.md S4): el alumno aceptado en la
  // audición queda inscrito de forma permanente y su inscripción nunca se
  // cancela por impago. La consecuencia de no pagar es perder el QR de acceso
  // (gate en /api/attendance/scan), y la deuda se acumula mes a mes en
  // `payments.billing_period`. Cancelarlo acá le quitaría el cupo que ganó
  // audicionando por no haber pagado a tiempo el primer mes.
  const staleEligible = (stalePending ?? []).filter(
    (e: any) => !e.is_2x && e.class && e.class.status === 'active' && e.class.type !== 'entrenamiento'
  )
  const staleIds = staleEligible.map((e: any) => e.id)
  const cancelledStale = staleIds.length
  if (staleIds.length > 0) {
    // P2-3: batch (update + void + notificaciones) en vez de por fila.
    await supabase.from('enrollments').update({ status: 'cancelled' } as any).in('id', staleIds)
    await (supabase as any)
      .from('payments')
      .update({ status: 'void' })
      .in('enrollment_id', staleIds)
      .not('status', 'in', '("verified","void")')
    await notifyUsers(supabase, staleEligible.map((e: any) => ({
      user_id: e.student_id,
      type: 'class_cancelled' as const,
      data: { class_id: e.class_id, class_title: e.class.title, reason: 'payment_timeout' },
    })))
    logger.info('cleanup-classes:stale-pending', { cancelledStale })
  }

  // ── F-21: Recordatorio de pago al alumno (24h sin subir comprobante) ─────────
  // Busca enrollments en pending_payment desde hace más de 24h, sin reminder previo.
  const twentyFourHoursAgo = new Date(now)
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

  const { data: pendingEnrollments } = await (supabase as any)
    .from('enrollments')
    .select('id, student_id, class_id, class:classes(title, status, type)')
    .eq('status', 'pending_payment')
    .lt('pending_since', twentyFourHoursAgo.toISOString())

  let paymentReminders = 0

  if (pendingEnrollments && pendingEnrollments.length > 0) {
    // Deduplication: fetch existing payment_reminder notifications sent today
    const { data: existingPaymentReminders } = await (supabase as any)
      .from('notifications')
      .select('user_id, data')
      .eq('type', 'payment_reminder')
      .gte('created_at', `${todayStr}T00:00:00.000Z`)

    const alreadyReminded = new Set<string>(
      (existingPaymentReminders ?? []).map((n: any) => `${n.user_id}:${(n.data as any)?.enrollment_id}`)
    )

    const reminderNotifs: NotifyRow[] = []
    for (const e of pendingEnrollments) {
      const cls = e.class
      // Solo clases activas
      if (!cls || cls.status === 'cancelled') continue
      // Los entrenamientos tienen su propio aviso, por mes adeudado
      // (`/api/cron/monthly-charges`): este recordatorio genérico los duplicaría.
      if (cls.type === 'entrenamiento') continue
      const key = `${e.student_id}:${e.id}`
      if (alreadyReminded.has(key)) continue

      reminderNotifs.push({
        user_id: e.student_id,
        type: 'payment_reminder',
        data: {
          enrollment_id: e.id,
          class_id: e.class_id,
          class_title: cls.title,
        },
      })
    }

    if (reminderNotifs.length > 0) {
      await notifyUsers(supabase, reminderNotifs)
      paymentReminders = reminderNotifs.length
    }
  }

  if (paymentReminders > 0) logger.info('cleanup-classes:payment-reminders', { paymentReminders })

  // ── P3-6: purga de comprobantes de pagos anulados/rechazados ────────────────
  // Un comprobante de un pago que quedó 'void' (inscripción cancelada) o
  // 'rejected' (el profesor lo rechazó) no vuelve a usarse, pero seguía viviendo
  // en el bucket privado `payment-receipts` para siempre. Se purga a los 90 días
  // (el alumno ya tuvo tiempo de resubir uno nuevo). Los pagos 'verified' NO se
  // tocan: son el respaldo del pago. Nota: `payments` no tiene created_at — la
  // referencia de antigüedad es submitted_at (cuándo se subió el comprobante).
  const RECEIPT_RETENTION_DAYS = 90
  const receiptCutoff = new Date(now.getTime() - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  let purgedReceipts = 0
  try {
    const { data: staleReceipts } = await (supabase as any)
      .from('payments')
      .select('id, receipt_url')
      .in('status', ['void', 'rejected', 'refunded'])
      .not('receipt_url', 'is', null)
      .lt('submitted_at', receiptCutoff.toISOString())

    if (staleReceipts && staleReceipts.length > 0) {
      const paths = staleReceipts
        .map((p: any) => receiptStoragePath(p.receipt_url))
        .filter(Boolean) as string[]
      if (paths.length > 0) await supabase.storage.from('payment-receipts').remove(paths)
      await (supabase as any)
        .from('payments')
        .update({ receipt_url: null })
        .in('id', staleReceipts.map((p: any) => p.id))
      purgedReceipts = staleReceipts.length
      logger.info('cleanup-classes:receipts', { purgedReceipts })
    }
  } catch (e) {
    logger.error('cleanup-classes:receipts', e)
  }

  // ── Delete stale chats (class chats 48h after class ended, rehearsal chats 48h after last date) ──
  // P2-3: recolectar ids en un Set y borrar en un solo batch (además corrige el
  // doble-conteo P3-2: cada chat se contaba/borraba hasta dos veces con los `if`
  // sin `continue`).
  let deletedChats = 0
  const chatIdsToDelete = new Set<string>()
  const CHAT_GRACE_MS = 48 * 3600 * 1000
  try {
    const { data: staleClassChats } = await (supabase as any)
      .from('chats')
      .select('id, class_id, class:classes(status, date, ends_at, ends_indefinitely, type)')
      .eq('type', 'class')
    for (const chat of (staleClassChats ?? []) as any[]) {
      const cls = chat.class
      if (!cls || cls.status === 'cancelled') { chatIdsToDelete.add(chat.id); continue }
      if (cls.type === 'suelta' && cls.date && new Date(cls.date).getTime() + CHAT_GRACE_MS < Date.now()) {
        chatIdsToDelete.add(chat.id); continue
      }
      if (cls.ends_at && !cls.ends_indefinitely && new Date(cls.ends_at).getTime() + CHAT_GRACE_MS < Date.now()) {
        chatIdsToDelete.add(chat.id)
      }
    }
    const { data: staleRehearsalChats } = await (supabase as any)
      .from('chats')
      .select('id, rehearsal_id, rehearsal:rehearsals(rehearsal_date, custom_dates, date_mode, status)')
      .eq('type', 'rehearsal')
    for (const chat of (staleRehearsalChats ?? []) as any[]) {
      const r = chat.rehearsal
      if (!r || r.status === 'cancelled') { chatIdsToDelete.add(chat.id); continue }
      let lastDate: Date | null = null
      if (r.date_mode === 'single' && r.rehearsal_date) lastDate = new Date(r.rehearsal_date)
      if (r.date_mode === 'custom' && r.custom_dates?.length) {
        const sorted = [...r.custom_dates].sort()
        lastDate = new Date(sorted[sorted.length - 1])
      }
      if (lastDate && lastDate.getTime() + CHAT_GRACE_MS < Date.now()) chatIdsToDelete.add(chat.id)
    }
    if (chatIdsToDelete.size > 0) {
      await (supabase as any).from('chats').delete().in('id', [...chatIdsToDelete])
      deletedChats = chatIdsToDelete.size
    }
  } catch (e) {
    logger.error('cleanup-classes:chats', { error: String(e) })
  }
  if (deletedChats > 0) logger.info('cleanup-classes:chats', { deletedChats })

  await pingHealthcheck(process.env.HEALTHCHECK_CLEANUP_CLASSES_UUID)

  return NextResponse.json({ archived: deleted, errors, reminders, cancelled2x, releasedHolds, cancelledStale, paymentReminders, purgedReceipts, deletedChats })
}

async function archiveClass(supabase: ReturnType<typeof createAdminClient>, cls: any) {
  const media: any[] = cls.class_media ?? []

  // Remove storage objects (imágenes viven en el bucket Supabase class-media).
  const storagePaths = media.map((m: any) => {
    const url: string = m.url
    const parts = url.split('/class-media/')
    return parts[1] ?? ''
  }).filter(Boolean)

  if (storagePaths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('class-media').remove(storagePaths)
    if (storageErr) return { error: `storage: ${storageErr.message}` }
  }

  // Los VIDEOS de clase viven en Cloudinary (no en el bucket) → borrarlos ahí
  // (item 10). deleteCloudinaryAssets ignora las URLs que no son de Cloudinary.
  await deleteCloudinaryAssets(media.map((m: any) => m.url))

  // Remove class_media rows
  await supabase.from('class_media').delete().eq('class_id', cls.id)

  // P2-7: los comprobantes de pago NO se purgan acá. Hasta esta sesión este
  // bloque borraba TODOS los receipt_url de la clase —incluidos los
  // 'verified'— a las 24h de archivar, mientras el bloque "P3-6" más arriba en
  // este mismo cron sólo purga 'void'/'rejected'/'refunded' a los 90 días y
  // deja los 'verified' intactos a propósito ("son el respaldo del pago").
  // Los dos convivían mal: el archivado le ganaba de mano al retention de 90
  // días y borraba evidencia de pagos ya verificados casi de inmediato — lo
  // que además contradice lo que `/privacy` promete sobre datos de pago.
  // Archivar una clase (dejarla solo en Historial) es independiente del ciclo
  // de vida de sus comprobantes; ese ciclo vive únicamente en el bloque P3-6.

  // Mark class as archived → history-only (404 en /class, fuera de feed/explore)
  await supabase.from('classes').update({ status: 'archived' } as any).eq('id', cls.id)

  return { error: null }
}
