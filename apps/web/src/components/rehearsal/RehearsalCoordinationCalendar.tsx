'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Users, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type DayAvailability = {
  date: string
  available_count: number
  total_members: number
  available_hours: number[]
}

interface Props {
  rehearsalId: string
  coordinateMonth: string // YYYY-MM
}

function getColorForDay(day: DayAvailability): string {
  if (day.total_members === 0) return 'bg-gray-100 dark:bg-dark-surface2'
  const ratio = day.available_count / day.total_members
  if (ratio === 0) return 'bg-gray-200 dark:bg-dark-surface2 text-gray-400 dark:text-dark-text2'
  if (ratio === 1) return 'bg-emerald-400 dark:bg-emerald-600 text-white'
  // Amarillo proporcional: de yellow-200 (10% disponibles) a yellow-400 (99%)
  if (ratio >= 0.7) return 'bg-yellow-300 dark:bg-yellow-600/80 text-gray-800 dark:text-white'
  if (ratio >= 0.4) return 'bg-yellow-200 dark:bg-yellow-700/60 text-gray-700 dark:text-yellow-100'
  return 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-600 dark:text-yellow-200'
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export default function RehearsalCoordinationCalendar({ rehearsalId, coordinateMonth }: Props) {
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState<DayAvailability[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState<DayAvailability | null>(null)
  const [month, setMonth] = useState(coordinateMonth)

  // Month navigation
  const [year, monthIdx] = month.split('-').map(Number)

  function prevMonth() {
    const d = new Date(year, monthIdx - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setCalendar([])
  }
  function nextMonth() {
    const d = new Date(year, monthIdx, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setCalendar([])
  }

  const load = useCallback(async (targetMonth: string) => {
    setLoading(true)
    setSelectedDay(null)
    try {
      const res = await fetch(
        `/api/rehearsal/group-availability?rehearsal_id=${rehearsalId}&month=${targetMonth}`
      )
      if (!res.ok) return
      const json = await res.json()
      setCalendar(json.calendar ?? [])
      setMembers(json.members ?? [])
      setInvites(json.invites ?? [])
    } finally {
      setLoading(false)
    }
  }, [rehearsalId])

  useEffect(() => { load(month) }, [month, load])

  // Build calendar grid
  const firstDay = new Date(year, monthIdx - 1, 1)
  const jsFirstDay = firstDay.getDay() // 0=Sun
  const startOffset = jsFirstDay === 0 ? 6 : jsFirstDay - 1
  const daysInMonth = new Date(year, monthIdx, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const calendarGrid = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    const dateStr = `${year}-${String(monthIdx).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    return calendar.find((d) => d.date === dateStr) ?? { date: dateStr, available_count: 0, total_members: members.length, available_hours: [] }
  })

  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[#7F77DD]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="rounded-xl border border-gray-100 dark:border-dark-border p-3 bg-gray-50 dark:bg-dark-surface2">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-[#7F77DD]" />
          <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
            {members.length} integrante{members.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gris-humo dark:text-dark-text2">
            ({acceptedCount} confirmado{acceptedCount !== 1 ? 's' : ''}, {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''})
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gris-humo dark:text-dark-text2 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-400 dark:bg-emerald-600 inline-block" />
            Todos disponibles
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-300 dark:bg-yellow-600/80 inline-block" />
            Algunos disponibles
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-200 dark:bg-dark-surface2 border border-gray-300 dark:border-dark-border inline-block" />
            Sin disponibilidad
          </span>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
        </button>
        <span className="font-semibold text-gray-900 dark:text-dark-text">
          {MONTHS_ES[monthIdx - 1]} {year}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
        </button>
      </div>

      {/* Calendar grid */}
      <div>
        <div className="grid grid-cols-7 text-center mb-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-gris-humo dark:text-dark-text2 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarGrid.map((day, i) => {
            if (!day) return <div key={i} />
            const dayNum = parseInt(day.date.split('-')[2], 10)
            const isSelected = selectedDay?.date === day.date
            const colorClass = getColorForDay(day)
            const hasAny = day.available_count > 0

            return (
              <button
                key={day.date}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={cn(
                  'relative flex flex-col items-center py-2 rounded-xl text-sm transition-all',
                  isSelected ? 'ring-2 ring-[#7F77DD] ring-offset-1' : '',
                  colorClass,
                  hasAny ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-60'
                )}
                title={`${day.available_count}/${day.total_members} disponibles`}
              >
                <span className="text-xs font-medium">{dayNum}</span>
                {hasAny && (
                  <span className="text-[9px] font-semibold">
                    {day.available_count}/{day.total_members}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedDay.available_hours.length > 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Horarios libres para todos el {(() => {
                const [, m, d] = selectedDay.date.split('-').map(Number)
                return `${d} de ${MONTHS_ES[m - 1]}`
              })()}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedDay.available_hours.map((h) => (
              <span key={h} className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                {formatHour(h)}
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedDay && selectedDay.available_hours.length === 0 && selectedDay.available_count > 0 && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-900/50 bg-yellow-50 dark:bg-yellow-900/10 p-3 text-sm text-yellow-800 dark:text-yellow-300">
          {selectedDay.available_count} de {selectedDay.total_members} integrantes tienen alguna hora libre,
          pero no hay un horario en que coincidan <em>todos</em>.
        </div>
      )}

      {/* Members list */}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide mb-2">Integrantes</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m: any) => {
              const invite = invites.find((i: any) => i.user_id === m.id)
              return (
                <div key={m.id} className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 bg-gray-100 dark:bg-dark-surface2 text-gray-700 dark:text-dark-text2">
                  <Avatar src={m.avatar_url} name={m.full_name} size="xs" />
                  @{m.username}
                  {invite && (
                    <span className={cn(
                      'ml-0.5 text-[9px] font-bold uppercase',
                      invite.status === 'accepted' ? 'text-emerald-600 dark:text-emerald-400' :
                      invite.status === 'rejected' ? 'text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                    )}>
                      {invite.status === 'accepted' ? '✓' : invite.status === 'rejected' ? '✗' : '?'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gris-humo dark:text-dark-text2 text-center">
        Disponibilidad calculada en bloques de 1 hora. Solo se consideran integrantes con invitación aceptada o pendiente.
        Los bloques de sueño y horarios ocupados manuales de cada integrante se excluyen.
      </p>
    </div>
  )
}
