'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Loader2, Users, Clock, Ban, Vote,
  Check, X, CalendarCheck, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import {
  buildDiscardIndex, toggleDayDiscard, toggleHourDiscard,
  tallyProposal, formatRange, hoursTouchedByRange, minutesToTime, timeToMinutes,
  type DiscardRow,
} from '@danceclass/shared'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type Member = {
  id: string
  username: string
  full_name: string
  avatar_url: string | null
  is_creator: boolean
  invite_status: string | null
}

type DayAvailability = {
  date: string
  available_count: number
  total_members: number
  available_hours: number[]
  /** hora → índices dentro de `members` */
  hour_free: Record<number, number[]>
}

type Proposal = {
  id: string
  proposed_date: string
  start_time: string
  end_time: string
  required_confirmations: number
  status: string
  votes?: { user_id: string; vote: 'yes' | 'no' }[]
}

interface Props {
  rehearsalId: string
  coordinateMonth: string // YYYY-MM
  currentUserId: string
  isCreator: boolean
  /** Se llama cuando la fecha queda fijada, para que la pantalla se recargue. */
  onDateFixed?: () => void
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

function formatDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${d} de ${MONTHS_ES[m - 1]}`
}

export default function RehearsalCoordinationCalendar({
  rehearsalId, coordinateMonth, currentUserId, isCreator, onDateFixed,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState<DayAvailability[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [discards, setDiscards] = useState<DiscardRow[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [fixed, setFixed] = useState<any>(null)
  const [selectedDay, setSelectedDay] = useState<DayAvailability | null>(null)
  const [month, setMonth] = useState(coordinateMonth)
  const [error, setError] = useState('')

  // Panel deslizable: 0 = disponibles para todos, 1 = disponibilidad parcial
  const [panel, setPanel] = useState<0 | 1>(0)
  const [hoverHour, setHoverHour] = useState<number | null>(null)

  // Votación
  const [voteForm, setVoteForm] = useState<{ hour: number; start: string; end: string; required: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const supabase = createClient()

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

  const load = useCallback(async (targetMonth: string, keepSelection?: string) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/rehearsal/group-availability?rehearsal_id=${rehearsalId}&month=${targetMonth}`
      )
      if (!res.ok) { setError('No se pudo cargar la disponibilidad'); return }
      const json = await res.json()
      const cal: DayAvailability[] = json.calendar ?? []
      setCalendar(cal)
      setMembers(json.members ?? [])
      setInvites(json.invites ?? [])
      setDiscards(json.discards ?? [])
      setProposal(json.proposal ?? null)
      setFixed(json.fixed ?? null)
      setError('')
      // Al recargar tras un descarte hay que re-apuntar el día seleccionado al
      // objeto nuevo, o el panel seguiría mostrando los conteos viejos.
      setSelectedDay(keepSelection ? (cal.find((d) => d.date === keepSelection) ?? null) : null)
    } finally {
      setLoading(false)
    }
  }, [rehearsalId])

  useEffect(() => { load(month) }, [month, load])

  const discardIndex = useMemo(() => buildDiscardIndex(discards), [discards])

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
    return calendar.find((d) => d.date === dateStr) ?? { date: dateStr, available_count: 0, total_members: members.length, available_hours: [], hour_free: {} }
  })

  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // Horas con disponibilidad parcial: al menos uno libre pero no todos.
  const partialHours = useMemo(() => {
    if (!selectedDay) return [] as number[]
    return Object.keys(selectedDay.hour_free)
      .map(Number)
      .filter((h) => {
        const n = selectedDay.hour_free[h]?.length ?? 0
        return n > 0 && n < selectedDay.total_members
      })
      .sort((a, b) => a - b)
  }, [selectedDay])

  const myDayDiscarded = selectedDay ? discardIndex.hasDay(currentUserId, selectedDay.date) : false

  const tally = useMemo(() => {
    if (!proposal) return null
    const creator = members.find((m) => m.is_creator)
    return tallyProposal(
      proposal.votes ?? [],
      proposal.required_confirmations,
      members.length,
      creator?.id ?? null,
    )
  }, [proposal, members])

  const myVote = proposal?.votes?.find((v) => v.user_id === currentUserId)?.vote ?? null

  async function handleToggleDay() {
    if (!selectedDay || busy) return
    setBusy(true)
    setError('')
    const res = await toggleDayDiscard(
      supabase as any, rehearsalId, currentUserId, selectedDay.date, !myDayDiscarded,
    )
    if (!res.ok) setError(res.error)
    await load(month, selectedDay.date)
    setBusy(false)
  }

  async function handleToggleHour(hour: number) {
    if (!selectedDay || busy) return
    const discarded = discardIndex.hasHour(currentUserId, selectedDay.date, hour)
    setBusy(true)
    setError('')
    const res = await toggleHourDiscard(
      supabase as any, rehearsalId, currentUserId, selectedDay.date, hour, !discarded, myDayDiscarded,
    )
    if (!res.ok) setError(res.error)
    await load(month, selectedDay.date)
    setBusy(false)
  }

  function openVoteForm(hour: number) {
    if (!selectedDay) return
    setVoteForm({
      hour,
      start: formatHour(hour),
      // Default de 1 h; el creador ajusta a minutos libres (12:30–13:35).
      end: minutesToTime((hour + 1) * 60),
      required: Math.max(1, Math.min(members.length, selectedDay.hour_free[hour]?.length ?? members.length)),
    })
  }

  async function submitProposal() {
    if (!voteForm || !selectedDay || busy) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/rehearsal/proposal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rehearsal_id: rehearsalId,
        proposed_date: selectedDay.date,
        start_time: voteForm.start,
        end_time: voteForm.end,
        required_confirmations: voteForm.required,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'No se pudo iniciar la votación'); return }
    setVoteForm(null)
    await load(month, selectedDay.date)
  }

  async function castVote(vote: 'yes' | 'no') {
    if (!proposal || busy) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/rehearsal/proposal/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposal.id, vote }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'No se pudo registrar tu voto'); return }
    if (json.confirmed) { onDateFixed?.() }
    await load(month, selectedDay?.date)
  }

  async function resolveProposal(action: 'fix_now' | 'cancel') {
    if (!proposal || busy) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/rehearsal/proposal/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposal.id, action }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'No se pudo cerrar la votación'); return }
    if (json.confirmed) { onDateFixed?.() }
    await load(month, selectedDay?.date)
  }

  if (loading && calendar.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[#7F77DD]" />
      </div>
    )
  }

  const voteFormRangeValid = voteForm
    ? (timeToMinutes(voteForm.end) ?? 0) > (timeToMinutes(voteForm.start) ?? 0)
    : false

  return (
    <div className="space-y-4">
      {/* Fecha ya fijada */}
      {fixed && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 p-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Fecha fijada: {formatDayLabel(fixed.date)}
                {fixed.time && ` · ${String(fixed.time).slice(0, 5)}`}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {fixed.duration_minutes} min · la coordinación quedó cerrada
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Votación en curso */}
      {proposal && tally && (
        <div className="rounded-xl border border-[#7F77DD]/40 bg-[#EEEDFE]/60 dark:bg-dark-surface2 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Vote className="h-5 w-5 text-[#7F77DD] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Votación abierta · {formatDayLabel(proposal.proposed_date)}
              </p>
              <p className="text-xs text-gris-humo dark:text-dark-text2">
                {formatRange({ start_time: proposal.start_time, end_time: proposal.end_time })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{tally.yes} confirmad{tally.yes === 1 ? 'o' : 'os'}</span>
            {tally.no > 0 && <span className="text-red-500 dark:text-red-400">{tally.no} no puede{tally.no === 1 ? '' : 'n'}</span>}
            {tally.pending > 0 && <span className="text-gris-humo dark:text-dark-text2">{tally.pending} sin responder</span>}
            <span className="ml-auto text-gray-700 dark:text-dark-text2">
              Se fija con {tally.required}
            </span>
          </div>

          {/* Barra de progreso hacia el umbral */}
          <div className="h-1.5 rounded-full bg-white/70 dark:bg-dark-bg overflow-hidden">
            <div
              className="h-full bg-[#7F77DD] transition-all"
              style={{ width: `${Math.min(100, (tally.yes / Math.max(1, tally.required)) * 100)}%` }}
            />
          </div>

          {/* Quién votó qué */}
          {(proposal.votes ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(proposal.votes ?? []).map((v) => {
                const m = memberById.get(v.user_id)
                return (
                  <span
                    key={v.user_id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      v.vote === 'yes'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    )}
                  >
                    {v.vote === 'yes' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    @{m?.username ?? '—'}
                  </span>
                )
              })}
            </div>
          )}

          {/* Mi voto */}
          {!isCreator && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => castVote('yes')}
                disabled={busy}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold py-2 transition-colors disabled:opacity-50',
                  myVote === 'yes'
                    ? 'bg-emerald-500 text-white'
                    : 'border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                )}
              >
                <Check className="h-3.5 w-3.5" />
                Puedo
              </button>
              <button
                onClick={() => castVote('no')}
                disabled={busy}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold py-2 transition-colors disabled:opacity-50',
                  myVote === 'no'
                    ? 'bg-red-500 text-white'
                    : 'border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface'
                )}
              >
                <X className="h-3.5 w-3.5" />
                No puedo
              </button>
            </div>
          )}

          {/* Salidas manuales del creador */}
          {isCreator && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => resolveProposal('fix_now')}
                disabled={busy}
                className="flex-1 rounded-xl bg-[#7F77DD] hover:bg-[#6B64C8] text-white text-xs font-semibold py-2 transition-colors disabled:opacity-50"
              >
                Fijar ahora ({tally.yes}/{tally.required})
              </button>
              <button
                onClick={() => resolveProposal('cancel')}
                disabled={busy}
                className="rounded-xl border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 text-xs font-medium px-3 py-2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

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
            const iDiscardedDay = discardIndex.hasDay(currentUserId, day.date)
            const isProposed = proposal?.proposed_date === day.date

            return (
              <button
                key={day.date}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={cn(
                  'relative flex flex-col items-center py-2 rounded-xl text-sm transition-all',
                  isSelected ? 'ring-2 ring-[#7F77DD] ring-offset-1' : '',
                  isProposed && !isSelected ? 'ring-2 ring-[#7F77DD]/50' : '',
                  colorClass,
                  'cursor-pointer hover:opacity-80',
                  iDiscardedDay && 'opacity-40'
                )}
                title={
                  iDiscardedDay
                    ? 'Descartaste este día'
                    : `${day.available_count}/${day.total_members} disponibles`
                }
                // El contenido visible del botón es "15" + "3/3": sin etiqueta,
                // un lector de pantalla lo lee sin mes y sin decir qué significa
                // la fracción.
                aria-label={
                  `${formatDayLabel(day.date)} · ${day.available_count} de ${day.total_members} disponibles` +
                  (iDiscardedDay ? ' · descartaste este día' : '')
                }
                aria-pressed={isSelected}
              >
                <span className={cn('text-xs font-medium', iDiscardedDay && 'line-through')}>{dayNum}</span>
                {hasAny && (
                  <span className="text-[9px] font-semibold">
                    {day.available_count}/{day.total_members}
                  </span>
                )}
                {iDiscardedDay && (
                  <Ban className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-red-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Detalle del día seleccionado: dos paneles deslizables ── */}
      {selectedDay && (
        <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          {/* Cabecera con las dos pestañas */}
          <div className="flex items-stretch border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2">
            <button
              onClick={() => setPanel(0)}
              className={cn(
                'flex-1 px-3 py-2.5 text-xs font-semibold transition-colors text-left',
                panel === 0
                  ? 'bg-white dark:bg-dark-surface text-emerald-700 dark:text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-gris-humo dark:text-dark-text2 hover:bg-white/60 dark:hover:bg-dark-surface/60'
              )}
            >
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Para todos
              </span>
              <span className="text-[10px] font-normal">
                {selectedDay.available_hours.length} horario{selectedDay.available_hours.length !== 1 ? 's' : ''}
              </span>
            </button>
            <button
              onClick={() => setPanel(1)}
              className={cn(
                'flex-1 px-3 py-2.5 text-xs font-semibold transition-colors text-left',
                panel === 1
                  ? 'bg-white dark:bg-dark-surface text-yellow-700 dark:text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-gris-humo dark:text-dark-text2 hover:bg-white/60 dark:hover:bg-dark-surface/60'
              )}
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Parciales
              </span>
              <span className="text-[10px] font-normal">
                {partialHours.length} horario{partialHours.length !== 1 ? 's' : ''}
              </span>
            </button>
          </div>

          {/* Deslizador horizontal entre paneles */}
          <div className="relative overflow-hidden bg-white dark:bg-dark-surface">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${panel * 100}%)` }}
            >
              {/* Panel 0 — disponibles para todos */}
              <div className="w-full flex-shrink-0 p-4">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
                  Horarios libres para todos el {formatDayLabel(selectedDay.date)}
                </p>
                {selectedDay.available_hours.length === 0 ? (
                  <p className="text-xs text-gris-humo dark:text-dark-text2">
                    No hay ningún horario en que coincidan <em>todos</em>.
                    {partialHours.length > 0 && (
                      <>
                        {' '}
                        <button
                          onClick={() => setPanel(1)}
                          className="text-[#7F77DD] font-medium hover:underline"
                        >
                          Ver los {partialHours.length} horarios parciales →
                        </button>
                      </>
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDay.available_hours.map((h) => (
                      <HourChip
                        key={h}
                        hour={h}
                        freeCount={selectedDay.total_members}
                        total={selectedDay.total_members}
                        tone="all"
                        iDiscarded={discardIndex.hasHour(currentUserId, selectedDay.date, h)}
                        canPropose={isCreator && !proposal && !fixed}
                        onPropose={() => openVoteForm(h)}
                        onToggleDiscard={() => handleToggleHour(h)}
                        hovered={hoverHour === h}
                        onHover={setHoverHour}
                        disabled={busy}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Panel 1 — disponibilidad parcial */}
              <div className="w-full flex-shrink-0 p-4">
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                  Horarios parciales el {formatDayLabel(selectedDay.date)}
                </p>
                <p className="text-[11px] text-gris-humo dark:text-dark-text2 mb-2">
                  Pasa el cursor sobre un horario para ver quiénes pueden. Sirve para iniciar una votación
                  cuando lo que importa es que estén ciertas personas, no todas.
                </p>
                {partialHours.length === 0 ? (
                  <p className="text-xs text-gris-humo dark:text-dark-text2">
                    Ningún horario parcial este día.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {partialHours.map((h) => (
                      <HourChip
                        key={h}
                        hour={h}
                        freeCount={(selectedDay.hour_free[h] ?? []).length}
                        total={selectedDay.total_members}
                        tone="partial"
                        iDiscarded={discardIndex.hasHour(currentUserId, selectedDay.date, h)}
                        canPropose={isCreator && !proposal && !fixed}
                        onPropose={() => openVoteForm(h)}
                        onToggleDiscard={() => handleToggleHour(h)}
                        hovered={hoverHour === h}
                        onHover={setHoverHour}
                        disabled={busy}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/*
            Quiénes pueden en la hora sobre la que está el cursor.
            Vive FUERA del deslizador a propósito: como tooltip flotante quedaba
            recortado por el `overflow-hidden` que necesita el translate de los
            paneles (comprobado en navegador — se cortaba la primera mitad).
            Altura reservada para que aparecer y desaparecer no mueva la página.
          */}
          <div className="border-t border-gray-200 dark:border-dark-border px-4 py-3 min-h-[92px] bg-white dark:bg-dark-surface">
            {hoverHour === null ? (
              <p className="text-[11px] text-gris-humo dark:text-dark-text2">
                Pasa el cursor sobre un horario para ver quiénes están disponibles.
              </p>
            ) : (() => {
              const freeIdx = selectedDay.hour_free[hoverHour] ?? []
              const freeMembers = freeIdx.map((i) => members[i]).filter(Boolean)
              const freeIds = new Set(freeMembers.map((m) => m.id))
              const busyMembers = members.filter((m) => !freeIds.has(m.id))
              return (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gris-humo dark:text-dark-text2">
                    {formatHour(hoverHour)} · {freeMembers.length} de {selectedDay.total_members}
                  </p>
                  {freeMembers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Disponibles</p>
                      <div className="flex flex-wrap gap-2">
                        {freeMembers.map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1 text-[11px] text-gray-700 dark:text-dark-text2">
                            <Avatar src={m.avatar_url} name={m.full_name} size="xs" />
                            {m.id === currentUserId ? 'Tú' : `@${m.username}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {busyMembers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 mb-1">No disponibles</p>
                      <div className="flex flex-wrap gap-2">
                        {busyMembers.map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-dark-text2/70">
                            <Avatar src={m.avatar_url} name={m.full_name} size="xs" />
                            {m.id === currentUserId ? 'Tú' : `@${m.username}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Descartar el día completo */}
          {!fixed && (
            <div className="border-t border-gray-200 dark:border-dark-border px-4 py-3 flex items-center justify-between gap-3 bg-gray-50/60 dark:bg-dark-surface2/60">
              <p className="text-[11px] text-gris-humo dark:text-dark-text2">
                {myDayDiscarded
                  ? 'Descartaste este día. Ya no cuenta tu disponibilidad.'
                  : '¿No puedes este día? Descártalo y el grupo lo verá.'}
              </p>
              <button
                onClick={handleToggleDay}
                disabled={busy}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl text-xs font-semibold px-3 py-1.5 transition-colors flex-shrink-0 disabled:opacity-50',
                  myDayDiscarded
                    ? 'border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    : 'border border-coral-fuego/40 text-coral-fuego hover:bg-coral-fuego/10'
                )}
              >
                {myDayDiscarded ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                {myDayDiscarded ? 'Recuperar día' : 'Descartar día'}
              </button>
            </div>
          )}

          {/* Quiénes descartaron este día */}
          {discardIndex.usersAtDay(selectedDay.date).length > 0 && (
            <div className="border-t border-gray-200 dark:border-dark-border px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-1.5">
                Descartaron el día completo
              </p>
              <div className="flex flex-wrap gap-1.5">
                {discardIndex.usersAtDay(selectedDay.date).map((uid) => {
                  const m = memberById.get(uid)
                  return (
                    <span key={uid} className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                      <Ban className="h-2.5 w-2.5" />
                      {uid === currentUserId ? 'Tú' : `@${m?.username ?? '—'}`}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formulario de votación */}
      {voteForm && selectedDay && (
        <div className="rounded-xl border border-[#7F77DD]/40 bg-white dark:bg-dark-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">
              Iniciar votación · {formatDayLabel(selectedDay.date)}
            </p>
            <button onClick={() => setVoteForm(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2">
              <X className="h-4 w-4 text-gray-500 dark:text-dark-text2" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Desde</label>
              <input
                type="time"
                value={voteForm.start}
                onChange={(e) => setVoteForm({ ...voteForm, start: e.target.value })}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Hasta</label>
              <input
                type="time"
                value={voteForm.end}
                onChange={(e) => setVoteForm({ ...voteForm, end: e.target.value })}
                className="input w-full text-sm"
              />
            </div>
          </div>
          <p className="text-[11px] text-gris-humo dark:text-dark-text2">
            Minutos libres: 12:30 a 13:35 es un horario válido.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">
              Confirmaciones necesarias para fijar el ensayo
            </label>
            <input
              type="number"
              value={voteForm.required}
              min={1}
              max={members.length}
              step={1}
              onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault() }}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              onChange={(e) => setVoteForm({
                ...voteForm,
                required: Math.max(1, Math.min(members.length, Number(e.target.value) || 1)),
              })}
              className="input w-20 text-sm"
            />
            <span className="ml-2 text-xs text-gris-humo dark:text-dark-text2">de {members.length} integrantes</span>
          </div>

          {/* Aviso de descartes en el rango: el creador ve a ciegas si no */}
          {(() => {
            const hours = hoursTouchedByRange({ start_time: voteForm.start, end_time: voteForm.end })
            const blocked = new Set<string>()
            for (const h of hours) {
              for (const uid of discardIndex.usersAtHour(selectedDay.date, h)) blocked.add(uid)
            }
            if (blocked.size === 0) return null
            return (
              <div className="flex items-start gap-2 rounded-lg bg-coral-fuego/10 border border-coral-fuego/30 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-coral-fuego flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-700 dark:text-dark-text2">
                  {blocked.size} integrante{blocked.size !== 1 ? 's' : ''} descartó este horario:{' '}
                  {[...blocked].map((uid) => `@${memberById.get(uid)?.username ?? '—'}`).join(', ')}.
                  Puedes proponerlo igual.
                </p>
              </div>
            )
          })()}

          <button
            onClick={submitProposal}
            disabled={busy || !voteFormRangeValid}
            className="w-full rounded-xl bg-[#7F77DD] hover:bg-[#6B64C8] text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {voteFormRangeValid
              ? `Iniciar votación (${formatRange({ start_time: voteForm.start, end_time: voteForm.end })})`
              : 'El término debe ser posterior al inicio'}
          </button>
        </div>
      )}

      {/* Members list */}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide mb-2">Integrantes</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 bg-gray-100 dark:bg-dark-surface2 text-gray-700 dark:text-dark-text2">
                <Avatar src={m.avatar_url} name={m.full_name} size="xs" />
                @{m.username}
                <span className={cn(
                  'ml-0.5 text-[9px] font-bold uppercase',
                  m.invite_status === 'creator' ? 'text-[#7F77DD] dark:text-violet-300' :
                  m.invite_status === 'accepted' ? 'text-emerald-600 dark:text-emerald-400' :
                  m.invite_status === 'rejected' ? 'text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                )}>
                  {m.invite_status === 'creator' ? '★' : m.invite_status === 'accepted' ? '✓' : m.invite_status === 'rejected' ? '✗' : '?'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gris-humo dark:text-dark-text2 text-center">
        Disponibilidad calculada en bloques de 1 hora. Solo se consideran integrantes con invitación aceptada o pendiente.
        Los bloques de sueño, horarios ocupados y clases de cada integrante se excluyen, y los horarios descartados a mano pesan por encima de todo eso.
      </p>
    </div>
  )
}

/**
 * Chip de un horario. Al pasarle el cursor levanta `hoverHour`, que es lo que
 * el bloque de disponibilidad de abajo consume — el chip NO dibuja el detalle
 * él mismo: un tooltip flotante acá queda recortado por el `overflow-hidden`
 * del deslizador de paneles.
 *
 * `onFocus`/`onBlur` además del ratón: los dos botones del chip son
 * alcanzables por teclado, y sin eso quien navega con Tab nunca vería quién
 * está disponible en el horario que está a punto de descartar o proponer.
 */
function HourChip({
  hour, freeCount, total, tone, iDiscarded,
  canPropose, onPropose, onToggleDiscard, hovered, onHover, disabled,
}: {
  hour: number
  freeCount: number
  total: number
  tone: 'all' | 'partial'
  iDiscarded: boolean
  canPropose: boolean
  onPropose: () => void
  onToggleDiscard: () => void
  hovered: boolean
  onHover: (h: number | null) => void
  disabled: boolean
}) {
  return (
    <div
      onMouseEnter={() => onHover(hour)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(hour)}
      onBlur={() => onHover(null)}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all',
        tone === 'all'
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
        hovered && 'ring-2 ring-[#7F77DD]',
        iDiscarded && 'opacity-50 line-through'
      )}
    >
      <span>{formatHour(hour)}</span>
      {tone === 'partial' && (
        <span className="text-[10px] font-bold">{freeCount}/{total}</span>
      )}
      <button
        onClick={onToggleDiscard}
        disabled={disabled}
        title={iDiscarded ? 'Recuperar este horario' : 'Descartar este horario'}
        className="ml-0.5 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        {iDiscarded ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
      </button>
      {canPropose && (
        <button
          onClick={onPropose}
          disabled={disabled}
          title="Iniciar votación en este horario"
          className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <Vote className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
