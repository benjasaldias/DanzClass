import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { isSleepHour } from '@danceclass/shared'

/**
 * Disponibilidad del grupo para coordinar un ensayo.
 *
 * Devuelve, por día del mes: las horas en que están libres TODOS
 * (`available_hours`) y —lo que agrega esta versión— QUIÉNES están libres en
 * cada hora (`hour_free`). Sin eso la UI sólo podía decir "no hay horario en
 * que coincidan todos" y el creador no tenía forma de saber si el que falta era
 * imprescindible.
 *
 * `hour_free` usa ÍNDICES dentro del array `members`, no UUIDs: un mes son
 * 31 × 24 entradas y con UUIDs el payload se iba a cientos de KB por cada
 * apertura del calendario.
 */
export async function GET(req: Request) {
  // requireUser acepta Bearer (mobile) y cookie (web). Antes esta ruta usaba
  // createClient() a secas, así que el calendario de mobile habría dado 401 —
  // el mismo defecto que S7 encontró en /api/rehearsal/respond.
  const auth = await requireUser(req)
  if ('error' in auth) return auth.error
  const { user } = auth

  const { searchParams } = new URL(req.url)
  const rehearsalId = searchParams.get('rehearsal_id')
  if (!rehearsalId) return NextResponse.json({ error: 'rehearsal_id requerido' }, { status: 400 })
  // Optional month override (YYYY-MM). Falls back to rehearsal.coordinate_month.
  const monthOverride = searchParams.get('month')
  if (monthOverride && !/^\d{4}-\d{2}$/.test(monthOverride)) {
    return NextResponse.json({ error: 'month inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Use admin client to bypass RLS; access is verified manually below
  const { data: rehearsal } = await (admin as any)
    .from('rehearsals')
    .select('id, creator_id, coordinate_month, rehearsal_date, rehearsal_time, duration_minutes, confirmed_at')
    .eq('id', rehearsalId)
    .single()

  if (!rehearsal) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 })

  // Get all invites (needed for access check and member calculation)
  const { data: invites } = await (admin as any)
    .from('rehearsal_invites')
    .select('user_id, status')
    .eq('rehearsal_id', rehearsalId)

  // Manual access check: must be creator or have any invite (any status)
  const isCreatorAccess = rehearsal.creator_id === user.id
  const hasInvite = (invites as any[] ?? []).some((i: any) => i.user_id === user.id)
  if (!isCreatorAccess && !hasInvite) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

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
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  // 5. Descartes explícitos del mes. Pesan MÁS que la ocupación derivada: un
  //    bloque ocupado es una inferencia, un descarte es "ese día no puedo".
  //    Van indexados por fecha (no por weekday) porque son puntuales.
  const { data: discardRows } = await (admin as any)
    .from('rehearsal_discards')
    .select('user_id, discard_date, hour')
    .eq('rehearsal_id', rehearsalId)
    .gte('discard_date', `${monthPrefix}-01`)
    .lte('discard_date', `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`)

  // date → userId → Set<hour> | 'all'
  const discardsByDate = new Map<string, Map<string, Set<number> | 'all'>>()
  for (const d of (discardRows as any[] ?? [])) {
    if (!discardsByDate.has(d.discard_date)) discardsByDate.set(d.discard_date, new Map())
    const perUser = discardsByDate.get(d.discard_date)!
    if (d.hour === null || d.hour === undefined) {
      perUser.set(d.user_id, 'all')
    } else {
      const cur = perUser.get(d.user_id)
      if (cur === 'all') continue
      const set = cur ?? new Set<number>()
      set.add(d.hour)
      perUser.set(d.user_id, set)
    }
  }

  function isDiscarded(userId: string, dateStr: string, hour: number): boolean {
    const perUser = discardsByDate.get(dateStr)
    if (!perUser) return false
    const entry = perUser.get(userId)
    if (entry === 'all') return true
    return entry?.has(hour) ?? false
  }

  type DayAvailability = {
    date: string
    available_count: number
    total_members: number
    available_hours: number[]
    /** hora → índices (en `members`) de quienes están libres. Sólo horas con ≥1. */
    hour_free: Record<number, number[]>
  }

  const calendar: DayAvailability[] = []
  const total = uniqueMemberIds.length
  const indexOfMember = new Map(uniqueMemberIds.map((id, i) => [id, i]))

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`
    const date = new Date(dateStr + 'T00:00:00')
    const jsDay = date.getDay()
    const wd = jsDay === 0 ? 6 : jsDay - 1 // 0=Mon..6=Sun

    const availableHours: number[] = []
    const hourFree: Record<number, number[]> = {}
    let maxFreeAtOnce = 0

    for (let h = 0; h <= 23; h++) {
      const key = `${wd}:${h}`
      const freeIdx: number[] = []
      for (const uid of uniqueMemberIds) {
        if (occupancy[uid]?.has(key)) continue
        if (isDiscarded(uid, dateStr, h)) continue
        freeIdx.push(indexOfMember.get(uid)!)
      }
      if (freeIdx.length > 0) hourFree[h] = freeIdx
      if (freeIdx.length === total) availableHours.push(h)
      if (freeIdx.length > maxFreeAtOnce) maxFreeAtOnce = freeIdx.length
    }

    calendar.push({
      date: dateStr,
      // available_count: max number of members free at any single hour
      available_count: maxFreeAtOnce,
      total_members: total,
      available_hours: availableHours,
      hour_free: hourFree,
    })
  }

  // Member info for the legend and for resolving hour_free indices
  const { data: memberProfiles } = await admin
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', uniqueMemberIds)

  // Ordered exactly like uniqueMemberIds — hour_free indexes into THIS array.
  const profileById = new Map((memberProfiles as any[] ?? []).map((p: any) => [p.id, p]))
  const members = uniqueMemberIds.map((id) => {
    const p = profileById.get(id)
    return {
      id,
      username: p?.username ?? '',
      full_name: p?.full_name ?? '',
      avatar_url: p?.avatar_url ?? null,
      is_creator: id === rehearsal.creator_id,
      invite_status: id === rehearsal.creator_id
        ? 'creator'
        : ((invites as any[] ?? []).find((i: any) => i.user_id === id)?.status ?? null),
    }
  })

  // Votación abierta (o la última resuelta, para que la UI pueda contar lo que
  // pasó). Una sola abierta a la vez la garantiza el índice único de 077.
  const { data: proposals } = await (admin as any)
    .from('rehearsal_proposals')
    .select('*, votes:rehearsal_proposal_votes(user_id, vote)')
    .eq('rehearsal_id', rehearsalId)
    .order('created_at', { ascending: false })
    .limit(5)

  const proposalRows = (proposals as any[] ?? [])
  const openProposal = proposalRows.find((p: any) => p.status === 'open') ?? null

  return NextResponse.json({
    calendar,
    members,
    invites: invites ?? [],
    // Crudos, para que cada integrante sepa qué descartó él mismo y el creador
    // vea de quién es cada descarte.
    discards: (discardRows as any[] ?? []),
    proposal: openProposal,
    last_resolved_proposal: proposalRows.find((p: any) => p.status === 'confirmed') ?? null,
    fixed: rehearsal.rehearsal_date
      ? {
          date: rehearsal.rehearsal_date,
          time: rehearsal.rehearsal_time,
          duration_minutes: rehearsal.duration_minutes,
          confirmed_at: rehearsal.confirmed_at,
        }
      : null,
  })
}
