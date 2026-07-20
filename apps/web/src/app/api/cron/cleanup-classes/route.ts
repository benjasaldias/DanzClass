import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

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
  const { data: activeClasses } = await (supabase as any)
    .from('classes')
    .select('id, type, date, time, recurrence, custom_dates, recurring_time, duration_minutes, ends_at, ends_indefinitely, class_media(*)')
    .in('status', ['active', 'completed'])

  for (const cls of activeClasses ?? []) {
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
    const newNotifs: any[] = target.student_ids
      .filter((sid) => !alreadySent.has(`${sid}:${target.class_id}`))
      .map((sid) => ({
        user_id: sid,
        type: 'class_reminder',
        data: {
          class_id: target.class_id,
          class_title: target.title,
          teacher_username: target.teacher_username,
          session_date: tomorrowStr,
          session_time: target.session_time,
        },
      }))

    if (newNotifs.length > 0) {
      await supabase.from('notifications').insert(newNotifs as any)
      reminders += newNotifs.length
    }
  }

  logger.info('cleanup-classes:reminders', { reminders })

  // ── 2x stale enrollment timeout: cancel after 7 days of non-payment ─────────
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: stale2x } = await (supabase as any)
    .from('enrollments')
    .select('id, student_id, class_id, partner_enrollment_id')
    .eq('is_2x', true)
    .eq('status', 'pending_payment')
    .lt('created_at', sevenDaysAgo.toISOString())

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
      .not('status', 'in', '("confirmed","void")')

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
          .not('status', 'in', '("confirmed","void")')

        await supabase.from('notifications').insert({
          user_id: partner.student_id,
          type: 'class_cancelled',
          data: { class_id: e.class_id, reason: '2x_payment_timeout' },
        } as any)
      }
    }

    await supabase.from('notifications').insert({
      user_id: e.student_id,
      type: 'class_cancelled',
      data: { class_id: e.class_id, reason: '2x_payment_timeout' },
    } as any)

    cancelled2x++
  }

  if (cancelled2x > 0) logger.info('cleanup-classes:2x', { cancelled2x })

  // ── Holds de cupo vencidos (item 3): clases sin pagos atrasados ──────────────
  // El cupo ya se liberó a nivel de la vista class_spots al expirar el hold; acá
  // solo hacemos la limpieza: cancelar la inscripción reservada nunca pagada y
  // anular su pago pendiente. Solo toca pending_payment con hold vencido.
  let releasedHolds = 0
  const { data: expiredHolds } = await (supabase as any)
    .from('enrollments')
    .select('id')
    .eq('status', 'pending_payment')
    .not('hold_expires_at', 'is', null)
    .lt('hold_expires_at', now.toISOString())

  for (const e of expiredHolds ?? []) {
    await supabase.from('enrollments').update({ status: 'cancelled' } as any).eq('id', e.id)
    await (supabase as any)
      .from('payments')
      .update({ status: 'void' })
      .eq('enrollment_id', e.id)
      .not('status', 'in', '("verified","void")')
    releasedHolds++
  }
  if (releasedHolds > 0) logger.info('cleanup-classes:holds', { releasedHolds })

  // ── F-21: Recordatorio de pago al alumno (24h sin subir comprobante) ─────────
  // Busca enrollments en pending_payment desde hace más de 24h, sin reminder previo.
  const twentyFourHoursAgo = new Date(now)
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

  const { data: pendingEnrollments } = await (supabase as any)
    .from('enrollments')
    .select('id, student_id, class_id, class:classes(title, status)')
    .eq('status', 'pending_payment')
    .lt('created_at', twentyFourHoursAgo.toISOString())

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

    const reminderNotifs: any[] = []
    for (const e of pendingEnrollments) {
      const cls = e.class
      // Solo clases activas
      if (!cls || cls.status === 'cancelled') continue
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
      await supabase.from('notifications').insert(reminderNotifs as any)
      paymentReminders = reminderNotifs.length
    }
  }

  if (paymentReminders > 0) logger.info('cleanup-classes:payment-reminders', { paymentReminders })

  // ── Delete stale chats (class chats 48h after class ended, rehearsal chats 48h after last date) ──
  let deletedChats = 0
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  try {
    // Class chats: delete if the class is soft-deleted or past its last date by 48h
    const { data: staleClassChats } = await (supabase as any)
      .from('chats')
      .select('id, class_id, class:classes(status, date, ends_at, ends_indefinitely, type)')
      .eq('type', 'class')
    for (const chat of (staleClassChats ?? []) as any[]) {
      const cls = chat.class
      if (!cls) { await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++; continue }
      if (cls.status === 'cancelled') { await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++; continue }
      // Suelta class — delete if date + 48h has passed
      if (cls.type === 'suelta' && cls.date && new Date(cls.date).getTime() + 48 * 3600 * 1000 < Date.now()) {
        await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++
      }
      // Periodica/entrenamiento with ends_at — delete if ends_at + 48h has passed
      if (cls.ends_at && !cls.ends_indefinitely && new Date(cls.ends_at).getTime() + 48 * 3600 * 1000 < Date.now()) {
        await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++
      }
    }
    // Rehearsal chats: delete if the rehearsal's last date + 48h has passed
    const { data: staleRehearsalChats } = await (supabase as any)
      .from('chats')
      .select('id, rehearsal_id, rehearsal:rehearsals(rehearsal_date, custom_dates, date_mode, status)')
      .eq('type', 'rehearsal')
    for (const chat of (staleRehearsalChats ?? []) as any[]) {
      const r = chat.rehearsal
      if (!r || r.status === 'cancelled') { await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++; continue }
      let lastDate: Date | null = null
      if (r.date_mode === 'single' && r.rehearsal_date) lastDate = new Date(r.rehearsal_date)
      if (r.date_mode === 'custom' && r.custom_dates?.length) {
        const sorted = [...r.custom_dates].sort()
        lastDate = new Date(sorted[sorted.length - 1])
      }
      if (lastDate && lastDate.getTime() + 48 * 3600 * 1000 < Date.now()) {
        await (supabase as any).from('chats').delete().eq('id', chat.id); deletedChats++
      }
    }
  } catch (e) {
    logger.error('cleanup-classes:chats', { error: String(e) })
  }
  if (deletedChats > 0) logger.info('cleanup-classes:chats', { deletedChats })

  await pingHealthcheck(process.env.HEALTHCHECK_CLEANUP_CLASSES_UUID)

  return NextResponse.json({ archived: deleted, errors, reminders, cancelled2x, releasedHolds, paymentReminders, deletedChats })
}

// Fin (incl. duración) de la última sesión de una clase, o null si no aplica
// (clase indefinida, o sin fecha determinable). Todo en hora local.
function lastSessionEnd(cls: any): Date | null {
  const durMs = (cls.duration_minutes ?? 60) * 60 * 1000
  const at = (ymd: string, hm: string | null | undefined): Date => {
    const [y, mo, d] = ymd.split('-').map(Number)
    const [h = 0, m = 0] = (hm ?? '00:00').split(':').map(Number)
    const dt = new Date(y, mo - 1, d, h, m)
    dt.setTime(dt.getTime() + durMs)
    return dt
  }
  if (cls.type === 'suelta') {
    return cls.date ? at(cls.date, cls.time) : null
  }
  if (cls.recurrence === 'custom' || (cls.custom_dates?.length ?? 0) > 0) {
    const dates: string[] = cls.custom_dates ?? []
    if (!dates.length) return null
    const last = [...dates].sort().at(-1)!
    return at(last, cls.recurring_time ?? cls.time)
  }
  // periódica / entrenamiento
  if (cls.ends_indefinitely) return null
  if (!cls.ends_at) return null
  return at(cls.ends_at, cls.recurring_time)
}

async function archiveClass(supabase: ReturnType<typeof createAdminClient>, cls: any) {
  const media: any[] = cls.class_media ?? []

  // Remove storage objects
  const storagePaths = media.map((m: any) => {
    const url: string = m.url
    const parts = url.split('/class-media/')
    return parts[1] ?? ''
  }).filter(Boolean)

  if (storagePaths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('class-media').remove(storagePaths)
    if (storageErr) return { error: `storage: ${storageErr.message}` }
  }

  // Remove class_media rows
  await supabase.from('class_media').delete().eq('class_id', cls.id)

  // Remove payment receipts for enrollments of this class
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, student_id, payment:payments(receipt_url)')
    .eq('class_id', cls.id)

  for (const e of enrollments ?? []) {
    const payment = (e as any).payment?.[0]
    if (payment?.receipt_url) {
      const value: string = payment.receipt_url
      // receipt_url puede ser un path puro (formato nuevo) o una URL legacy con /payment-receipts/<path>
      const path = value.includes('/payment-receipts/')
        ? value.split('/payment-receipts/')[1]
        : value
      if (path) {
        await supabase.storage.from('payment-receipts').remove([path])
      }
      await supabase.from('payments').update({ receipt_url: null }).eq('enrollment_id', e.id)
    }
  }

  // Mark class as archived → history-only (404 en /class, fuera de feed/explore)
  await supabase.from('classes').update({ status: 'archived' } as any).eq('id', cls.id)

  return { error: null }
}
