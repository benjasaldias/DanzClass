import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron runs this daily at 03:00 UTC.
// Deletes class-media storage files + class_media rows + payment-receipt files
// for classes whose deletion date has passed.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  // Protect from unauthorized calls in production
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  let deleted = 0
  let errors: string[] = []

  // ── Suelta classes: delete if date + 7 days < today ──────────────────────
  const suelataThreshold = new Date(now)
  suelataThreshold.setDate(suelataThreshold.getDate() - 7)
  const sueltaMax = suelataThreshold.toISOString().split('T')[0]

  const { data: sueltas } = await supabase
    .from('classes')
    .select('id, class_media(*)')
    .eq('type', 'suelta')
    .lt('date', sueltaMax)
    .neq('status', 'archived')

  for (const cls of sueltas ?? []) {
    const { error } = await cleanClassMedia(supabase, cls)
    if (error) errors.push(`class ${cls.id}: ${error}`)
    else deleted++
  }

  // ── Periodica classes: delete if end_of_prev_month + 7 days < today ──────
  // "end of prev month + 7" means we're now in the 8th day or later of next month
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0) // last day of prev month
  const periodicaThreshold = new Date(prevMonthEnd)
  periodicaThreshold.setDate(periodicaThreshold.getDate() + 7)

  if (now > periodicaThreshold) {
    const { data: periodicas } = await supabase
      .from('classes')
      .select('id, class_media(*)')
      .eq('type', 'periodica')
      .lt('updated_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
      .neq('status', 'archived')

    for (const cls of periodicas ?? []) {
      const { error } = await cleanClassMedia(supabase, cls)
      if (error) errors.push(`class ${cls.id}: ${error}`)
      else deleted++
    }
  }

  console.log(`[cleanup-classes] deleted=${deleted} errors=${errors.length}`)

  // ── Recordatorios 24h antes ─────────────────────────────────────────────────
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

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
    .eq('session_date', tomorrowStr) as any

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

  console.log(`[cleanup-classes] reminders=${reminders}`)
  return NextResponse.json({ deleted, errors, reminders })
}

async function cleanClassMedia(supabase: ReturnType<typeof createAdminClient>, cls: any) {
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
      const url: string = payment.receipt_url
      const parts = url.split('/payment-receipts/')
      const path = parts[1]
      if (path) {
        await supabase.storage.from('payment-receipts').remove([path])
      }
      await supabase.from('payments').update({ receipt_url: null }).eq('enrollment_id', e.id)
    }
  }

  // Mark class as archived so we don't process it again
  await supabase.from('classes').update({ status: 'completed' } as any).eq('id', cls.id)

  return { error: null }
}
