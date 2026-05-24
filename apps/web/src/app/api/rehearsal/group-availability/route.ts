import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSleepHour } from '@danceclass/shared'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rehearsalId = searchParams.get('rehearsal_id')
  if (!rehearsalId) return NextResponse.json({ error: 'rehearsal_id requerido' }, { status: 400 })
  // Optional month override (YYYY-MM). Falls back to rehearsal.coordinate_month.
  const monthOverride = searchParams.get('month')

  // Verify user has access to this rehearsal (creator or invitee)
  const { data: rehearsal } = await (supabase as any)
    .from('rehearsals')
    .select('id, creator_id, coordinate_month')
    .eq('id', rehearsalId)
    .single()

  if (!rehearsal) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 })

  const admin = createAdminClient()

  // Get all accepted/pending invitees + creator
  const { data: invites } = await (admin as any)
    .from('rehearsal_invites')
    .select('user_id, status')
    .eq('rehearsal_id', rehearsalId)

  const memberIds: string[] = [
    rehearsal.creator_id,
    ...((invites as any[] ?? [])
      .filter((i: any) => i.status !== 'rejected')
      .map((i: any) => i.user_id)),
  ]
  const uniqueMemberIds = [...new Set(memberIds)]

  // Fetch all members' sleep config and busy blocks using service role
  const [{ data: profiles }, { data: busyBlocks }, { data: enrollments }, { data: teaching }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, sleep_start, sleep_end')
        .in('id', uniqueMemberIds),
      (admin as any)
        .from('user_busy_blocks')
        .select('user_id, weekday, hour')
        .in('user_id', uniqueMemberIds),
      // Enrolled confirmed classes
      (admin as any)
        .from('enrollments')
        .select('student_id, class:classes(type, date, time, day_of_week, recurring_time, recurrence, custom_dates)')
        .in('student_id', uniqueMemberIds)
        .eq('status', 'confirmed'),
      // Teaching classes
      (admin as any)
        .from('classes')
        .select('teacher_id, type, date, time, day_of_week, recurring_time, recurrence, custom_dates')
        .in('teacher_id', uniqueMemberIds)
        .eq('status', 'active'),
    ])

  // Build per-user occupancy map: userId → Set<"weekday:hour">
  type OccupancyMap = Record<string, Set<string>>
  const occupancy: OccupancyMap = {}

  for (const uid of uniqueMemberIds) {
    occupancy[uid] = new Set<string>()
  }

  // 1. Sleep hours
  for (const p of (profiles as any[] ?? [])) {
    const sleepStart = p.sleep_start ?? 0
    const sleepEnd = p.sleep_end ?? 8
    for (let wd = 0; wd <= 6; wd++) {
      for (let h = 0; h <= 23; h++) {
        if (isSleepHour(h, sleepStart, sleepEnd)) {
          occupancy[p.id].add(`${wd}:${h}`)
        }
      }
    }
  }

  // 2. Manually marked busy blocks
  for (const b of (busyBlocks as any[] ?? [])) {
    occupancy[b.user_id]?.add(`${b.weekday}:${b.hour}`)
  }

  // Helper: weekday from YYYY-MM-DD (0=Mon..6=Sun, matches DB schema)
  function dateToWeekday(dateStr: string): number {
    const d = new Date(dateStr + 'T00:00:00')
    const jsDay = d.getDay()
    return jsDay === 0 ? 6 : jsDay - 1
  }

  // Helper: add class time as occupancy
  function addClassOccupancy(userId: string, cls: any) {
    if (!cls) return
    const timeStr: string | null = cls.type === 'suelta' ? cls.time : cls.recurring_time
    if (!timeStr) return
    const hour = parseInt(timeStr.split(':')[0], 10)

    if (cls.type === 'suelta') {
      if (!cls.date) return
      const wd = dateToWeekday(cls.date)
      occupancy[userId]?.add(`${wd}:${hour}`)
    } else if (cls.recurrence === 'custom') {
      for (const d of (cls.custom_dates ?? [])) {
        const wd = dateToWeekday(d)
        occupancy[userId]?.add(`${wd}:${hour}`)
      }
    } else if (cls.day_of_week !== null && cls.day_of_week !== undefined) {
      // periodic: day_of_week is JS convention (0=Sun..6=Sat), convert to our (0=Mon..6=Sun)
      const jsDay = cls.day_of_week
      const wd = jsDay === 0 ? 6 : jsDay - 1
      occupancy[userId]?.add(`${wd}:${hour}`)
    }
  }

  // 3. Enrolled classes
  for (const e of (enrollments as any[] ?? [])) {
    addClassOccupancy(e.student_id, e.class)
  }

  // 4. Teaching classes
  for (const cls of (teaching as any[] ?? [])) {
    addClassOccupancy(cls.teacher_id, cls)
  }

  // Build calendar availability for the requested month (override > coordinate_month > current month)
  const monthStr = monthOverride ?? rehearsal.coordinate_month
  const [year, month] = monthStr
    ? monthStr.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1]

  const daysInMonth = new Date(year, month, 0).getDate()

  type DayAvailability = {
    date: string
    available_count: number
    total_members: number
    available_hours: number[]
  }

  const calendar: DayAvailability[] = []
  const total = uniqueMemberIds.length

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const date = new Date(dateStr + 'T00:00:00')
    const jsDay = date.getDay()
    const wd = jsDay === 0 ? 6 : jsDay - 1 // 0=Mon..6=Sun

    // For each hour, count how many members are free
    const availableHours: number[] = []
    for (let h = 0; h <= 23; h++) {
      const key = `${wd}:${h}`
      const freeCount = uniqueMemberIds.filter((uid) => !occupancy[uid]?.has(key)).length
      if (freeCount === total) availableHours.push(h)
    }

    // available_count: max number of members free at any single hour
    let maxFreeAtOnce = 0
    for (let h = 0; h <= 23; h++) {
      const key = `${wd}:${h}`
      const freeCount = uniqueMemberIds.filter((uid) => !occupancy[uid]?.has(key)).length
      if (freeCount > maxFreeAtOnce) maxFreeAtOnce = freeCount
    }

    calendar.push({
      date: dateStr,
      available_count: maxFreeAtOnce,
      total_members: total,
      available_hours: availableHours,
    })
  }

  // Also return member info for legend
  const { data: memberProfiles } = await admin
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', uniqueMemberIds)

  return NextResponse.json({
    calendar,
    members: memberProfiles ?? [],
    invites: invites ?? [],
  })
}
