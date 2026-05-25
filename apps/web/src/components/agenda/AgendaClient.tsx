'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Moon, Loader2 } from 'lucide-react'
import { cn, getClassSessions, formatTime } from '@/lib/utils'
import { isSleepHour } from '@danceclass/shared'
import { createClient } from '@/lib/supabase/client'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface AgendaEvent {
  classId?: string
  rehearsalId?: string
  title: string
  style?: string
  time?: string
  teacher?: { full_name: string; username: string }
  isTeaching: boolean
  isRehearsal?: boolean
  inviteStatus?: 'creator' | 'accepted' | 'pending'
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  // Start on Monday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface AgendaClientProps {
  enrolledClasses: any[]
  teachingClasses: any[]
  rehearsals?: any[]
  currentUserId?: string
}

export default function AgendaClient({ enrolledClasses, teachingClasses, rehearsals = [], currentUserId }: AgendaClientProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [weekStart, setWeekStart] = useState(getWeekStart(today))
  const [selectedDay, setSelectedDay] = useState<string>(toYMD(today))

  // Build event map: YMD -> AgendaEvent[]
  const eventMap = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {}

    function addEvent(ymd: string, ev: AgendaEvent) {
      if (!map[ymd]) map[ymd] = []
      map[ymd].push(ev)
    }

    // Window for computation — cover current month ±3 months or current week ±12 weeks
    const windowStart = new Date(today)
    windowStart.setMonth(windowStart.getMonth() - 1)
    const windowEnd = new Date(today)
    windowEnd.setMonth(windowEnd.getMonth() + 4)

    for (const cls of enrolledClasses) {
      const sessions = getClassSessions(cls, windowStart, windowEnd)
      const time = cls.type === 'suelta' ? cls.time : cls.recurring_time
      for (const ymd of sessions) {
        addEvent(ymd, {
          classId: cls.id,
          title: cls.title,
          style: cls.dance_style,
          time,
          teacher: cls.teacher,
          isTeaching: false,
        })
      }
    }

    for (const cls of teachingClasses) {
      const sessions = getClassSessions(cls, windowStart, windowEnd)
      const time = cls.type === 'suelta' ? cls.time : cls.recurring_time
      for (const ymd of sessions) {
        addEvent(ymd, {
          classId: cls.id,
          title: cls.title,
          style: cls.dance_style,
          time,
          teacher: undefined,
          isTeaching: true,
        })
      }
    }

    // Rehearsals (only single and custom date modes have fixed dates)
    // invite_status is 'creator' | 'accepted' | 'pending' (rejected already filtered out)
    for (const r of rehearsals) {
      const inviteStatus: 'creator' | 'accepted' | 'pending' = r.invite_status ?? 'pending'
      if (r.date_mode === 'single' && r.rehearsal_date) {
        const [ry, rm, rd] = r.rehearsal_date.split('-').map(Number)
        const d = new Date(ry, rm - 1, rd)
        const ymd = toYMD(d)
        if (ymd >= toYMD(windowStart) && ymd <= toYMD(windowEnd)) {
          addEvent(ymd, {
            rehearsalId: r.id,
            title: r.title,
            time: r.rehearsal_time ?? undefined,
            isTeaching: false,
            isRehearsal: true,
            inviteStatus,
          })
        }
      } else if (r.date_mode === 'custom' && r.custom_dates?.length) {
        for (const dateStr of r.custom_dates) {
          const [ry, rm, rd] = dateStr.split('-').map(Number)
          const d = new Date(ry, rm - 1, rd)
          const ymd = toYMD(d)
          if (ymd >= toYMD(windowStart) && ymd <= toYMD(windowEnd)) {
            addEvent(ymd, {
              rehearsalId: r.id,
              title: r.title,
              isTeaching: false,
              isRehearsal: true,
              inviteStatus,
            })
          }
        }
      }
      // coordinate mode: no fixed date, shown in feed/coordination view instead
    }

    return map
  }, [enrolledClasses, teachingClasses, rehearsals, currentUserId])

  // ── Month view helpers ──────────────────────────────────────────
  const firstDayOfMonth = currentMonth.getDay() // 0=Sun
  // Offset so weeks start on Monday
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const calendarDays = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum)
  })

  // ── Week view helpers ────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)

  const formatWeekRange = () => {
    const s = weekStart
    const e = weekEnd
    if (s.getMonth() === e.getMonth()) {
      return `Semana del ${s.getDate()} al ${e.getDate()} de ${MONTHS_ES[s.getMonth()]} ${s.getFullYear()}`
    }
    return `${s.getDate()} de ${MONTHS_ES[s.getMonth()]} al ${e.getDate()} de ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`
  }

  const selectedEvents = eventMap[selectedDay] ?? []

  function EventCard({ ev }: { ev: AgendaEvent }) {
    const href = ev.isRehearsal ? `/rehearsal/${ev.rehearsalId}` : `/class/${ev.classId}`
    const isPending = ev.isRehearsal && ev.inviteStatus === 'pending'
    const barColor = ev.isRehearsal
      ? isPending ? 'bg-slate-400' : 'bg-violet-500'
      : ev.isTeaching
        ? 'bg-emerald-500'
        : 'bg-sky-500'
    const cardBg = ev.isRehearsal
      ? isPending
        ? 'bg-slate-50 dark:bg-dark-surface border-slate-200 dark:border-dark-border border-dashed opacity-80'
        : 'bg-violet-50 dark:bg-dark-surface2 border-violet-200 dark:border-dark-border'
      : ev.isTeaching
        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
        : 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800'

    const rehearsalLabel = ev.inviteStatus === 'creator'
      ? 'Organizas'
      : ev.inviteStatus === 'pending'
        ? 'Invitación pendiente'
        : 'Invitad@'

    return (
      <Link
        href={href}
        className={cn('flex items-start gap-3 p-3 rounded-xl border transition-colors hover:opacity-80', cardBg)}
      >
        <div className={cn('w-1 rounded-full self-stretch flex-shrink-0', barColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {ev.isRehearsal && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                Ensayo
              </span>
            )}
            {isPending && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
                Pendiente
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{ev.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ev.style && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                ev.isTeaching
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : ev.isRehearsal
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                    : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
              )}>
                {ev.style}
              </span>
            )}
            {ev.time && (
              <span className="flex items-center gap-1 text-xs text-gris-humo dark:text-dark-text2">
                <Clock className="h-3 w-3" />
                {formatTime(ev.time)}
              </span>
            )}
          </div>
          {ev.isRehearsal ? (
            <span className={cn('inline-block mt-1 text-xs font-medium', isPending ? 'text-slate-500 dark:text-slate-400' : 'text-violet-600 dark:text-violet-400')}>
              {rehearsalLabel}
            </span>
          ) : ev.isTeaching ? (
            <span className="inline-block mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">Tú dictas</span>
          ) : ev.teacher ? (
            <span className="text-xs text-gris-humo dark:text-dark-text2">Con @{ev.teacher.username}</span>
          ) : null}
        </div>
      </Link>
    )
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-dark-bg/95 backdrop-blur-md border-b border-gray-100 dark:border-dark-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            Mi Agenda
          </h1>
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-dark-border text-xs font-medium">
            <button
              onClick={() => setView('month')}
              className={cn('px-3 py-1.5 transition-colors', view === 'month' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2')}
            >
              Mes
            </button>
            <button
              onClick={() => setView('week')}
              className={cn('px-3 py-1.5 transition-colors', view === 'week' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-dark-surface text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2')}
            >
              Semana
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gris-humo dark:text-dark-text2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            Clases inscritas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Clases que dicto
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
            Ensayos
          </span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ── MONTH VIEW ─────────────────────────────────────── */}
        {view === 'month' && (
          <div className="space-y-4">
            {/* Month nav */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
              </button>
              <span className="font-semibold text-gray-900 dark:text-dark-text">
                {MONTHS_ES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 text-center">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                <div key={d} className="text-[10px] font-semibold text-gris-humo dark:text-dark-text2 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} />
                const ymd = toYMD(day)
                const isToday = isSameDay(day, today)
                const isSelected = ymd === selectedDay
                const events = eventMap[ymd] ?? []
                const hasEnrolled = events.some((e) => !e.isTeaching && !e.isRehearsal)
                const hasTeaching = events.some((e) => e.isTeaching)
                const hasRehearsal = events.some((e) => e.isRehearsal)

                return (
                  <button
                    key={ymd}
                    onClick={() => setSelectedDay(ymd)}
                    className={cn(
                      'relative flex flex-col items-center py-1.5 rounded-xl text-sm transition-colors',
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : isToday
                          ? 'bg-violet-100 dark:bg-dark-surface2 text-brand-600 dark:text-brand-300 font-bold ring-1 ring-brand-600/40'
                          : 'hover:bg-gray-100 dark:hover:bg-dark-surface2 text-gray-800 dark:text-dark-text'
                    )}
                  >
                    <span className="text-xs font-medium">{day.getDate()}</span>
                    {/* Dot indicators */}
                    {(hasEnrolled || hasTeaching || hasRehearsal) && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {hasEnrolled && (
                          <span className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : 'bg-sky-500')} />
                        )}
                        {hasTeaching && (
                          <span className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : 'bg-emerald-500')} />
                        )}
                        {hasRehearsal && (
                          <span className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : 'bg-violet-500')} />
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Day panel */}
            <div className="mt-2">
              {(() => {
                const [y, m, d] = selectedDay.split('-').map(Number)
                const selDate = new Date(y, m - 1, d)
                const label = `${DAYS_FULL_ES[selDate.getDay()]}, ${d} de ${MONTHS_ES[m - 1]}`
                return (
                  <div>
                    <h2 className="font-semibold text-sm text-gray-700 dark:text-dark-text mb-3">{label}</h2>
                    {selectedEvents.length === 0 ? (
                      <p className="text-sm text-gris-humo dark:text-dark-text2 text-center py-4">Sin compromisos este día</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedEvents.map((ev, i) => <EventCard key={i} ev={ev} />)}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ──────────────────────────────────────── */}
        {view === 'week' && (
          <div className="space-y-4">
            {/* Week nav */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-dark-text text-center">{formatWeekRange()}</span>
              <button
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
              </button>
            </div>

            {/* Days of the week */}
            <div className="space-y-3">
              {weekDays.map((day) => {
                const ymd = toYMD(day)
                const isToday = isSameDay(day, today)
                const events = eventMap[ymd] ?? []
                return (
                  <div
                    key={ymd}
                    className={cn(
                      'rounded-xl border p-3',
                      isToday
                        ? 'bg-violet-50 dark:bg-dark-surface2 border-brand-200 dark:border-brand-900/50'
                        : 'bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('text-sm font-semibold', isToday ? 'text-brand-600 dark:text-brand-300' : 'text-gray-700 dark:text-dark-text')}>
                        {DAYS_FULL_ES[day.getDay()]} {day.getDate()}
                      </span>
                      {isToday && <span className="text-xs bg-brand-600 text-white px-1.5 py-0.5 rounded-full">Hoy</span>}
                    </div>
                    {events.length === 0 ? (
                      <p className="text-xs text-gris-humo dark:text-dark-text2">Sin compromisos</p>
                    ) : (
                      <div className="space-y-2">
                        {events.map((ev, i) => <EventCard key={i} ev={ev} />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── DISPONIBILIDAD PERSONAL ────────────────────────── */}
        <AvailabilitySection />
      </div>
    </div>
  )
}

const GRID_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h)
const HOUR_OPTIONS = ALL_HOURS.map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))

function AvailabilitySection() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busyBlocks, setBusyBlocks] = useState<Set<string>>(new Set())
  const [sleepStart, setSleepStart] = useState(0)
  const [sleepEnd, setSleepEnd] = useState(8)
  const [savingSleep, setSavingSleep] = useState(false)
  const [sleepSaved, setSleepSaved] = useState(false)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: profile }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('sleep_start, sleep_end').eq('id', user.id).single(),
      (supabase as any).from('user_busy_blocks').select('weekday, hour').eq('user_id', user.id),
    ])

    if (profile) {
      setSleepStart((profile as any).sleep_start ?? 0)
      setSleepEnd((profile as any).sleep_end ?? 8)
    }
    if (blocks) {
      setBusyBlocks(new Set((blocks as any[]).map((b: any) => `${b.weekday}:${b.hour}`)))
    }
    setLoaded(true)
    setLoading(false)
  }

  function handleOpen() {
    setOpen((o) => {
      if (!o && !loaded) load()
      return !o
    })
  }

  async function toggleBlock(weekday: number, hour: number) {
    if (isSleepHour(hour, sleepStart, sleepEnd)) return
    const key = `${weekday}:${hour}`
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const wasBusy = busyBlocks.has(key)
    setBusyBlocks((prev) => {
      const next = new Set(prev)
      if (wasBusy) next.delete(key)
      else next.add(key)
      return next
    })

    if (wasBusy) {
      await (supabase as any)
        .from('user_busy_blocks')
        .delete()
        .eq('user_id', user.id)
        .eq('weekday', weekday)
        .eq('hour', hour)
    } else {
      await (supabase as any)
        .from('user_busy_blocks')
        .insert({ user_id: user.id, weekday, hour })
    }
  }

  async function saveSleep() {
    setSavingSleep(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ sleep_start: sleepStart, sleep_end: sleepEnd } as any)
        .eq('id', user.id)
    }
    setSavingSleep(false)
    setSleepSaved(true)
    setTimeout(() => setSleepSaved(false), 2000)
  }

  return (
    <div className="mt-6 border border-gray-100 dark:border-dark-border rounded-2xl overflow-hidden">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 dark:bg-dark-surface2 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
      >
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-dark-text">Mis horarios ocupados</p>
          <p className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">
            Marca cuándo no puedes bailar — el resto se asume libre
          </p>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-gray-400 dark:text-dark-text2 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="bg-white dark:bg-dark-surface px-4 pt-4 pb-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            </div>
          )}

          {loaded && (
            <>
              {/* Sleep config */}
              <div className="flex items-center gap-3 flex-wrap">
                <Moon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-dark-text">Duermo de</span>
                <select
                  value={sleepStart}
                  onChange={(e) => setSleepStart(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 text-sm text-gray-900 dark:text-dark-text px-2 py-1"
                >
                  {HOUR_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-700 dark:text-dark-text">a</span>
                <select
                  value={sleepEnd}
                  onChange={(e) => setSleepEnd(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 text-sm text-gray-900 dark:text-dark-text px-2 py-1"
                >
                  {HOUR_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={saveSleep}
                  disabled={savingSleep}
                  className={cn(
                    'ml-auto rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                    sleepSaved
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'
                  )}
                >
                  {savingSleep ? <Loader2 className="h-3 w-3 animate-spin inline" /> : sleepSaved ? '¡Guardado!' : 'Guardar'}
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-gris-humo dark:text-dark-text2">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-indigo-200 dark:bg-indigo-900/60 inline-block" />
                  Sueño
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-900/40 inline-block" />
                  Ocupado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-gray-100 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border inline-block" />
                  Libre
                </span>
              </div>

              {/* Grid */}
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full border-separate" style={{ borderSpacing: '2px' }}>
                  <thead>
                    <tr>
                      <th className="w-10" />
                      {GRID_DAYS.map((d) => (
                        <th key={d} className="text-[10px] font-semibold text-gris-humo dark:text-dark-text2 text-center pb-1">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_HOURS.map((hour) => (
                      <tr key={hour}>
                        <td className="text-[10px] text-gris-humo dark:text-dark-text2 pr-2 text-right w-10 leading-none py-0.5">
                          {String(hour).padStart(2, '0')}
                        </td>
                        {GRID_DAYS.map((_, weekday) => {
                          const sleep = isSleepHour(hour, sleepStart, sleepEnd)
                          const busy = !sleep && busyBlocks.has(`${weekday}:${hour}`)
                          return (
                            <td key={weekday} className="p-0">
                              <button
                                onClick={() => toggleBlock(weekday, hour)}
                                disabled={sleep}
                                title={sleep ? 'Horario de sueño' : busy ? 'Ocupado — clic para liberar' : 'Libre — clic para marcar ocupado'}
                                className={cn(
                                  'w-full h-5 rounded transition-colors',
                                  sleep
                                    ? 'bg-indigo-200 dark:bg-indigo-900/60 cursor-not-allowed'
                                    : busy
                                      ? 'bg-amber-200 dark:bg-amber-900/40 hover:bg-amber-300 dark:hover:bg-amber-900/60'
                                      : 'bg-gray-100 dark:bg-dark-surface2 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                                )}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gris-humo dark:text-dark-text2">
                Los cambios se guardan automáticamente al hacer clic en cada bloque.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
