'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react'
import { cn, getClassSessions, formatTime } from '@/lib/utils'

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface AgendaEvent {
  classId: string
  title: string
  style?: string
  time?: string
  teacher?: { full_name: string; username: string }
  isTeaching: boolean
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
}

export default function AgendaClient({ enrolledClasses, teachingClasses }: AgendaClientProps) {
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

    return map
  }, [enrolledClasses, teachingClasses])

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
    return (
      <Link
        href={`/class/${ev.classId}`}
        className={cn(
          'flex items-start gap-3 p-3 rounded-xl border transition-colors hover:opacity-80',
          ev.isTeaching
            ? 'bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-900/50'
            : 'bg-violet-50 dark:bg-dark-surface2 border-violet-200 dark:border-dark-border'
        )}
      >
        {/* Color bar */}
        <div className={cn('w-1 rounded-full self-stretch flex-shrink-0', ev.isTeaching ? 'bg-brand-600' : 'bg-[#7F77DD]')} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{ev.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ev.style && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', ev.isTeaching ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'bg-violet-100 dark:bg-dark-surface text-violet-700 dark:text-violet-300')}>
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
          {ev.isTeaching ? (
            <span className="inline-block mt-1 text-xs font-medium text-brand-600 dark:text-brand-300">Tú dictas</span>
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
        <div className="flex items-center gap-4 mt-2 text-xs text-gris-humo dark:text-dark-text2">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7F77DD]" />
            Clases inscritas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />
            Clases que dicto
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
                const hasEnrolled = events.some((e) => !e.isTeaching)
                const hasTeaching = events.some((e) => e.isTeaching)

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
                    {(hasEnrolled || hasTeaching) && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {hasEnrolled && (
                          <span className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : 'bg-[#7F77DD]')} />
                        )}
                        {hasTeaching && (
                          <span className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/80' : 'bg-brand-600')} />
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
                      <p className="text-sm text-gris-humo dark:text-dark-text2 text-center py-4">Sin clases este día</p>
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
                      <p className="text-xs text-gris-humo dark:text-dark-text2">Sin clases</p>
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

const DAYS_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function AvailabilitySection() {
  const [open, setOpen] = useState(false)
  // Local state only — persistence pendiente (ver resumen.md)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  function toggle(day: string) {
    setAvailability((prev) => ({ ...prev, [day]: !prev[day] }))
  }

  return (
    <div className="mt-6 border border-gray-100 dark:border-dark-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 dark:bg-dark-surface2 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
      >
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-dark-text">Mis días disponibles</p>
          <p className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">Marca los días en que puedes tomar clases</p>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-gray-400 dark:text-dark-text2 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-4 py-3 bg-white dark:bg-dark-surface space-y-2">
          <div className="flex flex-wrap gap-2">
            {DAYS_LABELS.map((day) => (
              <button
                key={day}
                onClick={() => toggle(day)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  availability[day]
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 hover:border-brand-400'
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="text-xs text-gris-humo dark:text-dark-text2 pt-1">
            Esta información se usará próximamente para sugerirte clases que calcen con tu horario.
          </p>
          <p className="text-[10px] text-gris-humo/60 dark:text-dark-text2/50 italic">
            Nota: la disponibilidad es local y no se guarda aún. Se persistirá en una sesión futura.
          </p>
        </div>
      )}
    </div>
  )
}
