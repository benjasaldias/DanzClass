import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, TextInput,
  useWindowDimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native'
import {
  ChevronLeft, ChevronRight, Users, Clock, Ban, Vote, Check, X,
  CalendarCheck, AlertTriangle,
} from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import Avatar from '../ui/Avatar'
import { WEB_URL } from '@danceclass/shared'
import {
  buildDiscardIndex, toggleDayDiscard, toggleHourDiscard,
  tallyProposal, formatRange, hoursTouchedByRange, minutesToTime, timeToMinutes,
  REHEARSAL_MONTHS_ES,
  type DiscardRow,
} from '@danceclass/shared'

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
  coordinateMonth: string
  currentUserId: string
  isCreator: boolean
  token: string | null
  onDateFixed?: () => void
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function formatDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${d} de ${REHEARSAL_MONTHS_ES[m - 1]}`
}

function dayCellClasses(day: DayAvailability): string {
  if (day.total_members === 0) return 'bg-gray-100 dark:bg-dark-surface2'
  const ratio = day.available_count / day.total_members
  if (ratio === 0) return 'bg-gray-200 dark:bg-dark-surface2'
  if (ratio === 1) return 'bg-emerald-400 dark:bg-emerald-600'
  if (ratio >= 0.7) return 'bg-yellow-300 dark:bg-yellow-600/80'
  if (ratio >= 0.4) return 'bg-yellow-200 dark:bg-yellow-700/60'
  return 'bg-yellow-100 dark:bg-yellow-900/30'
}

/**
 * Paridad completa del calendario de coordinación web (decisión de esta sesión:
 * mobile no lo tenía en absoluto). Dos diferencias de plataforma, no de alcance:
 * el segundo panel se alcanza deslizando de verdad (ScrollView paginado en vez
 * de un translate por CSS), y "quiénes pueden a esta hora" se abre con un TAP
 * en el horario porque en un teléfono no hay hover.
 */
export default function RehearsalCoordinationCalendar({
  rehearsalId, coordinateMonth, currentUserId, isCreator, token, onDateFixed,
}: Props) {
  const { isDark } = useTheme()
  const { width } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [calendar, setCalendar] = useState<DayAvailability[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [discards, setDiscards] = useState<DiscardRow[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [fixed, setFixed] = useState<any>(null)
  const [selectedDay, setSelectedDay] = useState<DayAvailability | null>(null)
  const [month, setMonth] = useState(coordinateMonth)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState<0 | 1>(0)
  const [openHour, setOpenHour] = useState<number | null>(null)
  const [voteForm, setVoteForm] = useState<{ start: string; end: string; required: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [year, monthIdx] = month.split('-').map(Number)
  // Ancho útil del panel: la tarjeta contenedora tiene padding lateral.
  const panelWidth = Math.max(220, width - 64)

  const iconColor = isDark ? '#EEEDFE' : '#374151'

  const load = useCallback(async (targetMonth: string, keepSelection?: string) => {
    setLoading(true)
    try {
      const res = await fetch(
        `${WEB_URL}/api/rehearsal/group-availability?rehearsal_id=${rehearsalId}&month=${targetMonth}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
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
      setSelectedDay(keepSelection ? (cal.find((d) => d.date === keepSelection) ?? null) : null)
    } catch {
      setError('No se pudo cargar la disponibilidad')
    } finally {
      setLoading(false)
    }
  }, [rehearsalId, token])

  useEffect(() => { load(month) }, [month, load])

  const discardIndex = useMemo(() => buildDiscardIndex(discards), [discards])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const firstDay = new Date(year, monthIdx - 1, 1)
  const jsFirstDay = firstDay.getDay()
  const startOffset = jsFirstDay === 0 ? 6 : jsFirstDay - 1
  const daysInMonth = new Date(year, monthIdx, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const calendarGrid = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    const dateStr = `${year}-${String(monthIdx).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    return calendar.find((d) => d.date === dateStr)
      ?? { date: dateStr, available_count: 0, total_members: members.length, available_hours: [], hour_free: {} }
  })

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
    return tallyProposal(proposal.votes ?? [], proposal.required_confirmations, members.length, creator?.id ?? null)
  }, [proposal, members])

  const myVote = proposal?.votes?.find((v) => v.user_id === currentUserId)?.vote ?? null

  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length

  async function post(path: string, body: any): Promise<any | null> {
    const res = await fetch(`${WEB_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? 'Algo salió mal'); return null }
    return json
  }

  async function handleToggleDay() {
    if (!selectedDay || busy) return
    setBusy(true); setError('')
    const res = await toggleDayDiscard(supabase as any, rehearsalId, currentUserId, selectedDay.date, !myDayDiscarded)
    if (!res.ok) setError(res.error)
    await load(month, selectedDay.date)
    setBusy(false)
  }

  async function handleToggleHour(hour: number) {
    if (!selectedDay || busy) return
    const discarded = discardIndex.hasHour(currentUserId, selectedDay.date, hour)
    setBusy(true); setError('')
    const res = await toggleHourDiscard(
      supabase as any, rehearsalId, currentUserId, selectedDay.date, hour, !discarded, myDayDiscarded,
    )
    if (!res.ok) setError(res.error)
    await load(month, selectedDay.date)
    setBusy(false)
  }

  async function submitProposal() {
    if (!voteForm || !selectedDay || busy) return
    setBusy(true); setError('')
    const json = await post('/api/rehearsal/proposal/create', {
      rehearsal_id: rehearsalId,
      proposed_date: selectedDay.date,
      start_time: voteForm.start,
      end_time: voteForm.end,
      required_confirmations: Math.max(1, Math.min(members.length, Number(voteForm.required) || 1)),
    })
    setBusy(false)
    if (json) { setVoteForm(null); await load(month, selectedDay.date) }
  }

  async function castVote(vote: 'yes' | 'no') {
    if (!proposal || busy) return
    setBusy(true); setError('')
    const json = await post('/api/rehearsal/proposal/vote', { proposal_id: proposal.id, vote })
    setBusy(false)
    if (json) {
      if (json.confirmed) onDateFixed?.()
      await load(month, selectedDay?.date)
    }
  }

  async function resolveProposal(action: 'fix_now' | 'cancel') {
    if (!proposal || busy) return
    setBusy(true); setError('')
    const json = await post('/api/rehearsal/proposal/resolve', { proposal_id: proposal.id, action })
    setBusy(false)
    if (json) {
      if (json.confirmed) onDateFixed?.()
      await load(month, selectedDay?.date)
    }
  }

  function onPanelScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / panelWidth)
    setPanel(idx >= 1 ? 1 : 0)
  }

  const rangeValid = voteForm
    ? (timeToMinutes(voteForm.end) ?? 0) > (timeToMinutes(voteForm.start) ?? 0)
    : false

  if (loading && calendar.length === 0) {
    return (
      <View className="py-8 items-center">
        <ActivityIndicator color="#7F77DD" />
      </View>
    )
  }

  return (
    <View className="gap-3">
      {/* Fecha fijada */}
      {fixed && (
        <View className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 flex-row items-center gap-2">
          <CalendarCheck size={18} stroke={isDark ? '#6EE7B7' : '#059669'} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Fecha fijada: {formatDayLabel(fixed.date)}{fixed.time ? ` · ${String(fixed.time).slice(0, 5)}` : ''}
            </Text>
            <Text className="text-xs text-emerald-700 dark:text-emerald-400">
              {fixed.duration_minutes} min · la coordinación quedó cerrada
            </Text>
          </View>
        </View>
      )}

      {/* Votación abierta */}
      {proposal && tally && (
        <View className="rounded-xl border border-[#7F77DD]/40 bg-lavanda-suave dark:bg-dark-surface2 p-3 gap-2.5">
          <View className="flex-row items-start gap-2">
            <Vote size={18} stroke="#7F77DD" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                Votación abierta · {formatDayLabel(proposal.proposed_date)}
              </Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2">
                {formatRange({ start_time: proposal.start_time, end_time: proposal.end_time })}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1">
            <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {tally.yes} confirmad{tally.yes === 1 ? 'o' : 'os'}
            </Text>
            {tally.no > 0 && (
              <Text className="text-xs text-red-500 dark:text-red-400">
                {tally.no} no puede{tally.no === 1 ? '' : 'n'}
              </Text>
            )}
            {tally.pending > 0 && (
              <Text className="text-xs text-gris-humo dark:text-dark-text2">{tally.pending} sin responder</Text>
            )}
            <Text className="text-xs text-gray-700 dark:text-dark-text2">Se fija con {tally.required}</Text>
          </View>

          <View className="h-1.5 rounded-full bg-white/70 dark:bg-dark-bg overflow-hidden">
            <View
              className="h-full bg-[#7F77DD]"
              style={{ width: `${Math.min(100, (tally.yes / Math.max(1, tally.required)) * 100)}%` }}
            />
          </View>

          {(proposal.votes ?? []).length > 0 && (
            <View className="flex-row flex-wrap gap-1.5">
              {(proposal.votes ?? []).map((v) => (
                <View
                  key={v.user_id}
                  className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${
                    v.vote === 'yes'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30'
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}
                >
                  {v.vote === 'yes'
                    ? <Check size={10} stroke={isDark ? '#6EE7B7' : '#047857'} />
                    : <X size={10} stroke={isDark ? '#FCA5A5' : '#B91C1C'} />}
                  <Text className={`text-[10px] font-medium ${
                    v.vote === 'yes'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-700 dark:text-red-300'
                  }`}>
                    @{memberById.get(v.user_id)?.username ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!isCreator && (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => castVote('yes')}
                disabled={busy}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                  myVote === 'yes' ? 'bg-emerald-500' : 'border border-emerald-300 dark:border-emerald-800'
                } ${busy ? 'opacity-50' : ''}`}
              >
                <Check size={14} stroke={myVote === 'yes' ? '#fff' : (isDark ? '#6EE7B7' : '#059669')} />
                <Text className={`text-xs font-semibold ${
                  myVote === 'yes' ? 'text-white' : 'text-emerald-700 dark:text-emerald-400'
                }`}>Puedo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => castVote('no')}
                disabled={busy}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                  myVote === 'no' ? 'bg-red-500' : 'border border-gray-200 dark:border-dark-border'
                } ${busy ? 'opacity-50' : ''}`}
              >
                <X size={14} stroke={myVote === 'no' ? '#fff' : (isDark ? '#A39BBF' : '#6B7280')} />
                <Text className={`text-xs font-semibold ${
                  myVote === 'no' ? 'text-white' : 'text-gray-600 dark:text-dark-text2'
                }`}>No puedo</Text>
              </TouchableOpacity>
            </View>
          )}

          {isCreator && (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => resolveProposal('fix_now')}
                disabled={busy}
                className={`flex-1 rounded-xl bg-[#7F77DD] py-2.5 items-center ${busy ? 'opacity-50' : ''}`}
              >
                <Text className="text-xs font-semibold text-white">
                  Fijar ahora ({tally.yes}/{tally.required})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => resolveProposal('cancel')}
                disabled={busy}
                className={`rounded-xl border border-gray-200 dark:border-dark-border px-3 py-2.5 ${busy ? 'opacity-50' : ''}`}
              >
                <Text className="text-xs font-medium text-gray-600 dark:text-dark-text2">Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {error !== '' && (
        <View className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2">
          <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
        </View>
      )}

      {/* Leyenda */}
      <View className="rounded-xl border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2 p-3">
        <View className="flex-row items-center gap-2 mb-2 flex-wrap">
          <Users size={14} stroke="#7F77DD" />
          <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">
            {members.length} integrante{members.length !== 1 ? 's' : ''}
          </Text>
          <Text className="text-xs text-gris-humo dark:text-dark-text2">
            ({acceptedCount} confirmado{acceptedCount !== 1 ? 's' : ''}, {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''})
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1.5">
            <View className="w-3 h-3 rounded bg-emerald-400 dark:bg-emerald-600" />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Todos</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-3 h-3 rounded bg-yellow-300 dark:bg-yellow-600/80" />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Algunos</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-3 h-3 rounded bg-gray-200 dark:bg-dark-surface2 border border-gray-300 dark:border-dark-border" />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Nadie</Text>
          </View>
        </View>
      </View>

      {/* Nav de mes */}
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => {
            const d = new Date(year, monthIdx - 2, 1)
            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            setCalendar([])
          }}
          className="p-1.5 rounded-lg"
        >
          <ChevronLeft size={20} stroke={iconColor} />
        </TouchableOpacity>
        <Text className="font-semibold text-gray-900 dark:text-dark-text">
          {REHEARSAL_MONTHS_ES[monthIdx - 1]} {year}
        </Text>
        <TouchableOpacity
          onPress={() => {
            const d = new Date(year, monthIdx, 1)
            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            setCalendar([])
          }}
          className="p-1.5 rounded-lg"
        >
          <ChevronRight size={20} stroke={iconColor} />
        </TouchableOpacity>
      </View>

      {/* Grid del mes */}
      <View>
        <View className="flex-row mb-1">
          {DAY_HEADERS.map((d) => (
            <View key={d} className="flex-1 items-center py-1">
              <Text className="text-[10px] font-semibold text-gris-humo dark:text-dark-text2">{d}</Text>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap">
          {calendarGrid.map((day, i) => {
            if (!day) return <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} className="p-0.5" />
            const dayNum = parseInt(day.date.split('-')[2], 10)
            const isSelected = selectedDay?.date === day.date
            const iDiscardedDay = discardIndex.hasDay(currentUserId, day.date)
            const isProposed = proposal?.proposed_date === day.date
            return (
              <View key={day.date} style={{ width: `${100 / 7}%` }} className="p-0.5">
                <TouchableOpacity
                  onPress={() => { setSelectedDay(isSelected ? null : day); setOpenHour(null) }}
                  className={`items-center py-2 rounded-xl ${dayCellClasses(day)} ${
                    isSelected ? 'border-2 border-[#7F77DD]' : isProposed ? 'border border-[#7F77DD]' : ''
                  } ${iDiscardedDay ? 'opacity-40' : ''}`}
                >
                  <Text className={`text-xs font-medium ${
                    day.available_count === day.total_members && day.total_members > 0
                      ? 'text-white'
                      : 'text-gray-800 dark:text-dark-text'
                  }`}>
                    {dayNum}
                  </Text>
                  {day.available_count > 0 && (
                    <Text className={`text-[9px] font-semibold ${
                      day.available_count === day.total_members
                        ? 'text-white'
                        : 'text-gray-700 dark:text-dark-text2'
                    }`}>
                      {day.available_count}/{day.total_members}
                    </Text>
                  )}
                  {iDiscardedDay && (
                    <View className="absolute top-0.5 right-0.5">
                      <Ban size={10} stroke="#EF4444" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      </View>

      {/* Detalle del día: dos paneles deslizables */}
      {selectedDay && (
        <View className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          {/* Pestañas */}
          <View className="flex-row border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2">
            {(['Para todos', 'Parciales'] as const).map((label, idx) => {
              const active = panel === idx
              const count = idx === 0 ? selectedDay.available_hours.length : partialHours.length
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => setPanel(idx as 0 | 1)}
                  className={`flex-1 px-3 py-2.5 ${
                    active
                      ? `bg-white dark:bg-dark-surface border-b-2 ${idx === 0 ? 'border-emerald-500' : 'border-yellow-400'}`
                      : ''
                  }`}
                >
                  <View className="flex-row items-center gap-1.5">
                    {idx === 0
                      ? <Clock size={13} stroke={active ? (isDark ? '#6EE7B7' : '#047857') : (isDark ? '#A39BBF' : '#6B6880')} />
                      : <Users size={13} stroke={active ? (isDark ? '#FDE68A' : '#A16207') : (isDark ? '#A39BBF' : '#6B6880')} />}
                    <Text className={`text-xs font-semibold ${
                      active
                        ? (idx === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-yellow-700 dark:text-yellow-400')
                        : 'text-gris-humo dark:text-dark-text2'
                    }`}>
                      {label}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-gris-humo dark:text-dark-text2">
                    {count} horario{count !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Deslizador real: dos páginas del ancho del contenedor */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPanelScroll}
            contentOffset={{ x: panel * panelWidth, y: 0 }}
            className="bg-white dark:bg-dark-surface"
          >
            {/* Panel 0 */}
            <View style={{ width: panelWidth }} className="p-3.5">
              <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
                Horarios libres para todos el {formatDayLabel(selectedDay.date)}
              </Text>
              {selectedDay.available_hours.length === 0 ? (
                <View>
                  <Text className="text-xs text-gris-humo dark:text-dark-text2">
                    No hay ningún horario en que coincidan todos.
                  </Text>
                  {partialHours.length > 0 && (
                    <TouchableOpacity onPress={() => setPanel(1)} className="mt-1">
                      <Text className="text-xs font-medium text-[#7F77DD]">
                        Desliza para ver los {partialHours.length} horarios parciales →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-1.5">
                  {selectedDay.available_hours.map((h) => (
                    <HourChip
                      key={h}
                      hour={h}
                      tone="all"
                      freeCount={selectedDay.total_members}
                      total={selectedDay.total_members}
                      iDiscarded={discardIndex.hasHour(currentUserId, selectedDay.date, h)}
                      open={openHour === h}
                      onPress={() => setOpenHour(openHour === h ? null : h)}
                      isDark={isDark}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Panel 1 */}
            <View style={{ width: panelWidth }} className="p-3.5">
              <Text className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                Horarios parciales el {formatDayLabel(selectedDay.date)}
              </Text>
              <Text className="text-[11px] text-gris-humo dark:text-dark-text2 mb-2">
                Toca un horario para ver quiénes pueden. Sirve para votar cuando lo que importa es que estén ciertas personas.
              </Text>
              {partialHours.length === 0 ? (
                <Text className="text-xs text-gris-humo dark:text-dark-text2">
                  Ningún horario parcial este día.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-1.5">
                  {partialHours.map((h) => (
                    <HourChip
                      key={h}
                      hour={h}
                      tone="partial"
                      freeCount={selectedDay.hour_free[h]?.length ?? 0}
                      total={selectedDay.total_members}
                      iDiscarded={discardIndex.hasHour(currentUserId, selectedDay.date, h)}
                      open={openHour === h}
                      onPress={() => setOpenHour(openHour === h ? null : h)}
                      isDark={isDark}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Quiénes pueden en la hora abierta (el equivalente del hover web) */}
          {openHour !== null && selectedDay && (
            <View className="border-t border-gray-200 dark:border-dark-border px-3.5 py-3 bg-gray-50/60 dark:bg-dark-surface2/60 gap-2">
              <Text className="text-[10px] font-bold uppercase text-gris-humo dark:text-dark-text2">
                {formatHour(openHour)} · {(selectedDay.hour_free[openHour] ?? []).length} de {selectedDay.total_members}
              </Text>
              {(() => {
                const freeIdx = selectedDay.hour_free[openHour] ?? []
                const freeMembers = freeIdx.map((i) => members[i]).filter(Boolean)
                const freeIds = new Set(freeMembers.map((m) => m.id))
                const busyMembers = members.filter((m) => !freeIds.has(m.id))
                return (
                  <>
                    {freeMembers.length > 0 && (
                      <View>
                        <Text className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Disponibles</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {freeMembers.map((m) => (
                            <View key={m.id} className="flex-row items-center gap-1">
                              <Avatar url={m.avatar_url} name={m.full_name} size="xs" />
                              <Text className="text-[10px] text-gray-700 dark:text-dark-text2">@{m.username}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {busyMembers.length > 0 && (
                      <View>
                        <Text className="text-[10px] font-semibold text-red-500 dark:text-red-400 mb-1">No disponibles</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {busyMembers.map((m) => (
                            <View key={m.id} className="flex-row items-center gap-1">
                              <Avatar url={m.avatar_url} name={m.full_name} size="xs" />
                              <Text className="text-[10px] text-gray-500 dark:text-dark-text2">@{m.username}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )
              })()}

              {/* Acciones sobre esa hora */}
              {!fixed && (
                <View className="flex-row gap-2 pt-1">
                  <TouchableOpacity
                    onPress={() => handleToggleHour(openHour!)}
                    disabled={busy}
                    className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                      discardIndex.hasHour(currentUserId, selectedDay.date, openHour!)
                        ? 'border-emerald-300 dark:border-emerald-800'
                        : 'border-coral-fuego/40'
                    } ${busy ? 'opacity-50' : ''}`}
                  >
                    {discardIndex.hasHour(currentUserId, selectedDay.date, openHour!)
                      ? <Check size={13} stroke={isDark ? '#6EE7B7' : '#059669'} />
                      : <Ban size={13} stroke="#D85A30" />}
                    <Text className={`text-xs font-semibold ${
                      discardIndex.hasHour(currentUserId, selectedDay.date, openHour!)
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-coral-fuego'
                    }`}>
                      {discardIndex.hasHour(currentUserId, selectedDay.date, openHour!) ? 'Recuperar' : 'Descartar'}
                    </Text>
                  </TouchableOpacity>

                  {isCreator && !proposal && (
                    <TouchableOpacity
                      onPress={() => setVoteForm({
                        start: formatHour(openHour!),
                        end: minutesToTime((openHour! + 1) * 60),
                        required: String(Math.max(1, Math.min(
                          members.length,
                          (selectedDay.hour_free[openHour!] ?? []).length || members.length,
                        ))),
                      })}
                      disabled={busy}
                      className={`flex-row items-center gap-1.5 rounded-xl bg-[#7F77DD] px-3 py-1.5 ${busy ? 'opacity-50' : ''}`}
                    >
                      <Vote size={13} stroke="#fff" />
                      <Text className="text-xs font-semibold text-white">Iniciar votación</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Descartar el día completo */}
          {!fixed && (
            <View className="border-t border-gray-200 dark:border-dark-border px-3.5 py-3 flex-row items-center justify-between gap-3">
              <Text className="text-[11px] text-gris-humo dark:text-dark-text2 flex-1">
                {myDayDiscarded
                  ? 'Descartaste este día.'
                  : '¿No puedes este día? Descártalo.'}
              </Text>
              <TouchableOpacity
                onPress={handleToggleDay}
                disabled={busy}
                className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-1.5 ${
                  myDayDiscarded ? 'border-emerald-300 dark:border-emerald-800' : 'border-coral-fuego/40'
                } ${busy ? 'opacity-50' : ''}`}
              >
                {myDayDiscarded
                  ? <Check size={13} stroke={isDark ? '#6EE7B7' : '#059669'} />
                  : <Ban size={13} stroke="#D85A30" />}
                <Text className={`text-xs font-semibold ${
                  myDayDiscarded ? 'text-emerald-700 dark:text-emerald-400' : 'text-coral-fuego'
                }`}>
                  {myDayDiscarded ? 'Recuperar día' : 'Descartar día'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Quiénes descartaron el día */}
          {discardIndex.usersAtDay(selectedDay.date).length > 0 && (
            <View className="border-t border-gray-200 dark:border-dark-border px-3.5 py-2.5">
              <Text className="text-[10px] font-semibold uppercase text-gris-humo dark:text-dark-text2 mb-1.5">
                Descartaron el día completo
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {discardIndex.usersAtDay(selectedDay.date).map((uid) => (
                  <View key={uid} className="flex-row items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5">
                    <Ban size={10} stroke={isDark ? '#FCA5A5' : '#B91C1C'} />
                    <Text className="text-[10px] font-medium text-red-700 dark:text-red-400">
                      {uid === currentUserId ? 'Tú' : `@${memberById.get(uid)?.username ?? '—'}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Formulario de votación */}
      {voteForm && selectedDay && (
        <View className="rounded-xl border border-[#7F77DD]/40 bg-white dark:bg-dark-surface p-3.5 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">
              Iniciar votación · {formatDayLabel(selectedDay.date)}
            </Text>
            <TouchableOpacity onPress={() => setVoteForm(null)} className="p-1">
              <X size={16} stroke={iconColor} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-700 dark:text-dark-text2 mb-1">Desde (HH:MM)</Text>
              <TextInput
                value={voteForm.start}
                onChangeText={(v: string) => setVoteForm({ ...voteForm, start: v })}
                placeholder="12:30"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={5}
                className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-medium text-gray-700 dark:text-dark-text2 mb-1">Hasta (HH:MM)</Text>
              <TextInput
                value={voteForm.end}
                onChangeText={(v: string) => setVoteForm({ ...voteForm, end: v })}
                placeholder="13:35"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={5}
                className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
              />
            </View>
          </View>

          <View>
            <Text className="text-xs font-medium text-gray-700 dark:text-dark-text2 mb-1">
              Confirmaciones necesarias (de {members.length})
            </Text>
            <TextInput
              value={voteForm.required}
              onChangeText={(v: string) => setVoteForm({ ...voteForm, required: v.replace(/[^0-9]/g, '') })}
              keyboardType="numeric"
              maxLength={3}
              className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm w-20 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            />
          </View>

          {/* Aviso de descartes en el rango */}
          {(() => {
            const hours = hoursTouchedByRange({ start_time: voteForm.start, end_time: voteForm.end })
            const blocked = new Set<string>()
            for (const h of hours) {
              for (const uid of discardIndex.usersAtHour(selectedDay.date, h)) blocked.add(uid)
            }
            if (blocked.size === 0) return null
            return (
              <View className="flex-row items-start gap-2 rounded-lg border border-coral-fuego/30 bg-coral-fuego/10 px-3 py-2">
                <AlertTriangle size={14} stroke="#D85A30" />
                <Text className="text-[11px] text-gray-700 dark:text-dark-text2 flex-1">
                  {blocked.size} integrante{blocked.size !== 1 ? 's' : ''} descartó este horario:{' '}
                  {[...blocked].map((uid) => `@${memberById.get(uid)?.username ?? '—'}`).join(', ')}. Puedes proponerlo igual.
                </Text>
              </View>
            )
          })()}

          <TouchableOpacity
            onPress={submitProposal}
            disabled={busy || !rangeValid}
            className={`rounded-xl bg-[#7F77DD] py-3 items-center ${busy || !rangeValid ? 'opacity-50' : ''}`}
          >
            <Text className="text-sm font-semibold text-white">
              {rangeValid
                ? `Iniciar votación (${formatRange({ start_time: voteForm.start, end_time: voteForm.end })})`
                : 'El término debe ser posterior al inicio'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Integrantes */}
      {members.length > 0 && (
        <View>
          <Text className="text-xs font-semibold uppercase text-gris-humo dark:text-dark-text2 mb-2">Integrantes</Text>
          <View className="flex-row flex-wrap gap-2">
            {members.map((m) => (
              <View key={m.id} className="flex-row items-center gap-1.5 rounded-full bg-gray-100 dark:bg-dark-surface2 px-2.5 py-1">
                <Avatar url={m.avatar_url} name={m.full_name} size="xs" />
                <Text className="text-xs text-gray-700 dark:text-dark-text2">@{m.username}</Text>
                <Text className={`text-[9px] font-bold ${
                  m.invite_status === 'creator' ? 'text-[#7F77DD] dark:text-violet-300'
                    : m.invite_status === 'accepted' ? 'text-emerald-600 dark:text-emerald-400'
                    : m.invite_status === 'rejected' ? 'text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  {m.invite_status === 'creator' ? '★' : m.invite_status === 'accepted' ? '✓' : m.invite_status === 'rejected' ? '✗' : '?'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text className="text-[10px] text-gris-humo dark:text-dark-text2 text-center">
        Disponibilidad en bloques de 1 hora. Sueño, horarios ocupados y clases de cada integrante se excluyen;
        los horarios descartados a mano pesan por encima de todo eso.
      </Text>
    </View>
  )
}

function HourChip({
  hour, tone, freeCount, total, iDiscarded, open, onPress, isDark,
}: {
  hour: number
  tone: 'all' | 'partial'
  freeCount: number
  total: number
  iDiscarded: boolean
  open: boolean
  onPress: () => void
  isDark: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center gap-1 rounded-lg px-2 py-1.5 ${
        tone === 'all'
          ? 'bg-emerald-100 dark:bg-emerald-900/30'
          : 'bg-yellow-100 dark:bg-yellow-900/30'
      } ${open ? 'border border-[#7F77DD]' : ''} ${iDiscarded ? 'opacity-50' : ''}`}
    >
      <Text className={`text-xs font-medium ${
        tone === 'all'
          ? 'text-emerald-800 dark:text-emerald-300'
          : 'text-yellow-800 dark:text-yellow-300'
      }`}>
        {String(hour).padStart(2, '0')}:00
      </Text>
      {tone === 'partial' && (
        <Text className="text-[10px] font-bold text-yellow-800 dark:text-yellow-300">
          {freeCount}/{total}
        </Text>
      )}
      {iDiscarded && <Ban size={11} stroke={isDark ? '#FCA5A5' : '#B91C1C'} />}
    </TouchableOpacity>
  )
}
