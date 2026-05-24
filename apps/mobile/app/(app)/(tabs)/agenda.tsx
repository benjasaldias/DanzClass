import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, ChevronDown, Moon, Check } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getClassSessions, toYMD, formatTime } from '../../../lib/utils'
import { useTheme } from '../../../context/ThemeContext'
import { canTeach, isSleepHour } from '@danceclass/shared'
import TopBar from '../../../components/ui/TopBar'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface AgendaEvent {
  classId?: string
  rehearsalId?: string
  title: string
  style?: string
  time?: string
  teacher?: string
  isTeaching: boolean
  isRehearsal?: boolean
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const GRID_DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h)

export default function AgendaScreen() {
  const router = useRouter()
  const { isDark } = useTheme()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([])
  const [teachingClasses, setTeachingClasses] = useState<any[]>([])
  const [rehearsals, setRehearsals] = useState<any[]>([])
  const [weekStart, setWeekStart] = useState(getWeekStart(today))
  const [availOpen, setAvailOpen] = useState(false)
  const [availLoaded, setAvailLoaded] = useState(false)
  const [availLoading, setAvailLoading] = useState(false)
  const [busyBlocks, setBusyBlocks] = useState<Set<string>>(new Set())
  const [sleepStart, setSleepStart] = useState(0)
  const [sleepEnd, setSleepEnd] = useState(8)
  const [savingSleep, setSavingSleep] = useState(false)
  const [sleepSaved, setSleepSaved] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: tier }, { data: enrollments }, { data: teaching }, { data: rehearsalData }] = await Promise.all([
      (supabase as any).from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      (supabase as any)
        .from('enrollments')
        .select(`
          class:classes(
            id, title, dance_style, type, recurrence,
            date, time, start_date, ends_at, ends_indefinitely,
            custom_dates, recurring_time, day_of_week,
            teacher:profiles!teacher_id(username)
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'confirmed'),
      (supabase as any)
        .from('classes')
        .select(`
          id, title, dance_style, type, recurrence,
          date, time, start_date, ends_at, ends_indefinitely,
          custom_dates, recurring_time, day_of_week
        `)
        .eq('teacher_id', user.id)
        .eq('status', 'active'),
      (supabase as any)
        .from('rehearsals')
        .select('id, title, date_mode, rehearsal_date, rehearsal_time, custom_dates, invites:rehearsal_invites(user_id, status)')
        .eq('status', 'active'),
    ])

    const currentTier = tier?.tier ?? 'none'
    const enrolled = (enrollments ?? []).map((e: any) => e.class).filter(Boolean)
    const teach = canTeach(currentTier) ? (teaching ?? []) : []
    const teachIds = new Set(teach.map((c: any) => c.id))
    setEnrolledClasses(enrolled.filter((c: any) => !teachIds.has(c.id)))
    setTeachingClasses(teach)
    // Only include rehearsals where user is creator or has accepted/pending invite
    const myRehearsals = (rehearsalData ?? []).filter((r: any) => {
      const myInvite = (r.invites ?? []).find((i: any) => i.user_id === user.id)
      return myInvite?.status !== 'rejected'
    })
    setRehearsals(myRehearsals)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function loadAvailability() {
    setAvailLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAvailLoading(false); return }

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
    setAvailLoaded(true)
    setAvailLoading(false)
  }

  function handleAvailOpen() {
    setAvailOpen((o) => {
      if (!o && !availLoaded) loadAvailability()
      return !o
    })
  }

  async function toggleBlock(weekday: number, hour: number) {
    if (isSleepHour(hour, sleepStart, sleepEnd)) return
    const key = `${weekday}:${hour}`
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

  // Build event map for current week ±4 weeks
  const eventMap = useMemo<Record<string, AgendaEvent[]>>(() => {
    const map: Record<string, AgendaEvent[]> = {}
    const windowStart = addDays(weekStart, -28)
    const windowEnd = addDays(weekStart, 56)

    function add(ymd: string, ev: AgendaEvent) {
      if (!map[ymd]) map[ymd] = []
      map[ymd].push(ev)
    }

    for (const cls of enrolledClasses) {
      const sessions = getClassSessions(cls, windowStart, windowEnd)
      const time = cls.type === 'suelta' ? cls.time : cls.recurring_time
      for (const ymd of sessions) {
        add(ymd, {
          classId: cls.id,
          title: cls.title,
          style: cls.dance_style,
          time,
          teacher: cls.teacher?.username,
          isTeaching: false,
        })
      }
    }

    for (const cls of teachingClasses) {
      const sessions = getClassSessions(cls, windowStart, windowEnd)
      const time = cls.type === 'suelta' ? cls.time : cls.recurring_time
      for (const ymd of sessions) {
        add(ymd, {
          classId: cls.id,
          title: cls.title,
          style: cls.dance_style,
          time,
          isTeaching: true,
        })
      }
    }

    // Rehearsals (single + custom date modes only; coordinate has no confirmed date)
    for (const r of rehearsals) {
      if (r.date_mode === 'single' && r.rehearsal_date) {
        add(r.rehearsal_date, {
          rehearsalId: r.id,
          title: r.title,
          time: r.rehearsal_time ?? undefined,
          isTeaching: false,
          isRehearsal: true,
        })
      } else if (r.date_mode === 'custom' && r.custom_dates?.length) {
        for (const d of r.custom_dates) {
          add(d, {
            rehearsalId: r.id,
            title: r.title,
            time: r.rehearsal_time ?? undefined,
            isTeaching: false,
            isRehearsal: true,
          })
        }
      }
    }

    return map
  }, [enrolledClasses, teachingClasses, rehearsals, weekStart])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = addDays(weekStart, 6)

  const formatWeekRange = () => {
    const s = weekStart
    const e = weekEnd
    if (s.getMonth() === e.getMonth()) {
      return `${s.getDate()} al ${e.getDate()} de ${MONTHS_ES[s.getMonth()]} ${s.getFullYear()}`
    }
    return `${s.getDate()} de ${MONTHS_ES[s.getMonth()]} al ${e.getDate()} de ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`
  }

  const iconColor = isDark ? '#EEEDFE' : '#374151'

  if (loading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-blanco-violeta dark:bg-dark-bg">
        <TopBar title="Mi Agenda" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-blanco-violeta dark:bg-dark-bg">
      <TopBar title="Mi Agenda" />

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c026d3" />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ── Week header ─────────────────────────────── */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
          <TouchableOpacity
            onPress={() => setWeekStart(addDays(weekStart, -7))}
            className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-dark-surface2"
          >
            <ChevronLeft size={20} stroke={iconColor} />
          </TouchableOpacity>
          <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text text-center flex-1 px-2">
            Semana del {formatWeekRange()}
          </Text>
          <TouchableOpacity
            onPress={() => setWeekStart(addDays(weekStart, 7))}
            className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-dark-surface2"
          >
            <ChevronRight size={20} stroke={iconColor} />
          </TouchableOpacity>
        </View>

        {/* ── Legend ──────────────────────────────────── */}
        <View className="flex-row items-center gap-4 px-4 py-2 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border flex-wrap">
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7F77DD' }} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Inscritas</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#c026d3' }} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Que dicto</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7F77DD', opacity: 0.7 }} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Ensayos</Text>
          </View>
        </View>

        {/* ── Days ─────────────────────────────────────── */}
        <View className="px-3 pt-3 space-y-3">
          {weekDays.map((day) => {
            const ymd = toYMD(day)
            const isToday = isSameDay(day, today)
            const events = eventMap[ymd] ?? []
            const dayLabel = `${DAYS_FULL_ES[day.getDay()]} ${day.getDate()}`

            return (
              <View
                key={ymd}
                className={`rounded-xl border mb-3 overflow-hidden ${
                  isToday
                    ? 'bg-violet-50 dark:bg-dark-surface2 border-brand-200 dark:border-brand-900/50'
                    : 'bg-white dark:bg-dark-surface border-gray-100 dark:border-dark-border'
                }`}
              >
                {/* Day header */}
                <View className="flex-row items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-dark-border">
                  <CalendarDays size={14} stroke={isToday ? '#c026d3' : (isDark ? '#A39BBF' : '#6B6880')} />
                  <Text className={`text-sm font-semibold ${isToday ? 'text-brand-600 dark:text-brand-300' : 'text-gray-700 dark:text-dark-text'}`}>
                    {dayLabel}
                  </Text>
                  {isToday && (
                    <View className="bg-brand-600 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-xs font-medium">Hoy</Text>
                    </View>
                  )}
                </View>

                {/* Events or empty */}
                <View className="px-3 py-2 space-y-2">
                  {events.length === 0 ? (
                    <Text className="text-xs text-gris-humo dark:text-dark-text2 py-1">Sin compromisos</Text>
                  ) : (
                    events.map((ev, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => ev.isRehearsal
                          ? router.push(`/(app)/rehearsal/${ev.rehearsalId}` as any)
                          : router.push(`/(app)/class/${ev.classId}` as any)
                        }
                        className={`flex-row items-start gap-3 p-2.5 rounded-xl mb-1 ${
                          ev.isRehearsal
                            ? 'bg-violet-50/60 dark:bg-dark-surface2'
                            : ev.isTeaching
                              ? 'bg-brand-50 dark:bg-brand-950/30'
                              : 'bg-violet-50 dark:bg-dark-surface2'
                        }`}
                        activeOpacity={0.7}
                      >
                        {/* Color bar */}
                        <View
                          style={{
                            width: 3,
                            borderRadius: 2,
                            alignSelf: 'stretch',
                            backgroundColor: ev.isRehearsal ? '#7F77DD' : ev.isTeaching ? '#c026d3' : '#7F77DD',
                            flexShrink: 0,
                            opacity: ev.isRehearsal ? 0.7 : 1,
                          }}
                        />
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text flex-1" numberOfLines={1}>
                              {ev.title}
                            </Text>
                            {ev.isRehearsal && (
                              <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: '#EEEDFE' }}>
                                <Text style={{ color: '#534AB7', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ensayo</Text>
                              </View>
                            )}
                          </View>
                          <View className="flex-row flex-wrap items-center gap-2 mt-0.5">
                            {ev.style && (
                              <View className={`px-1.5 py-0.5 rounded-full ${ev.isTeaching ? 'bg-brand-100 dark:bg-brand-900/30' : 'bg-violet-100 dark:bg-dark-surface'}`}>
                                <Text className={`text-xs ${ev.isTeaching ? 'text-brand-700 dark:text-brand-300' : 'text-violet-700 dark:text-violet-300'}`}>
                                  {ev.style}
                                </Text>
                              </View>
                            )}
                            {ev.time && (
                              <View className="flex-row items-center gap-1">
                                <Clock size={11} stroke={isDark ? '#A39BBF' : '#6B6880'} />
                                <Text className="text-xs text-gris-humo dark:text-dark-text2">{formatTime(ev.time)}</Text>
                              </View>
                            )}
                          </View>
                          {ev.isRehearsal ? (
                            <Text className="text-xs font-medium mt-0.5" style={{ color: '#7F77DD' }}>Ensayo</Text>
                          ) : ev.isTeaching ? (
                            <Text className="text-xs font-medium text-brand-600 dark:text-brand-300 mt-0.5">Tú dictas</Text>
                          ) : ev.teacher ? (
                            <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">Con @{ev.teacher}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            )
          })}
        </View>

        {/* ── Horarios ocupados ────────────────────────── */}
        <View className="mx-3 mt-1 mb-4 border border-gray-100 dark:border-dark-border rounded-xl overflow-hidden">
          <TouchableOpacity
            onPress={handleAvailOpen}
            className="flex-row items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-surface2"
            activeOpacity={0.7}
          >
            <View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">Mis horarios ocupados</Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">
                Marca cuándo no puedes bailar — el resto se asume libre
              </Text>
            </View>
            <ChevronDown
              size={16}
              stroke={isDark ? '#A39BBF' : '#9ca3af'}
              style={{ transform: [{ rotate: availOpen ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {availOpen && (
            <View className="bg-white dark:bg-dark-surface px-3 pt-4 pb-5">

              {availLoading && (
                <View className="items-center py-8">
                  <ActivityIndicator color="#c026d3" />
                </View>
              )}

              {availLoaded && (
                <>
                  {/* Sleep config */}
                  <View className="flex-row items-center flex-wrap gap-2 mb-4">
                    <Moon size={15} stroke="#818cf8" />
                    <Text className="text-sm text-gray-700 dark:text-dark-text">Duermo de</Text>
                    {/* sleepStart stepper */}
                    <View className="flex-row items-center border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                      <TouchableOpacity
                        onPress={() => setSleepStart((h) => (h === 0 ? 23 : h - 1))}
                        className="px-2 py-1 bg-gray-50 dark:bg-dark-surface2"
                        activeOpacity={0.7}
                      >
                        <Text className="text-base text-gray-700 dark:text-dark-text font-bold">−</Text>
                      </TouchableOpacity>
                      <Text className="px-2 text-sm font-medium text-gray-900 dark:text-dark-text">
                        {String(sleepStart).padStart(2, '0')}:00
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSleepStart((h) => (h === 23 ? 0 : h + 1))}
                        className="px-2 py-1 bg-gray-50 dark:bg-dark-surface2"
                        activeOpacity={0.7}
                      >
                        <Text className="text-base text-gray-700 dark:text-dark-text font-bold">+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text className="text-sm text-gray-700 dark:text-dark-text">a</Text>
                    {/* sleepEnd stepper */}
                    <View className="flex-row items-center border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                      <TouchableOpacity
                        onPress={() => setSleepEnd((h) => (h === 0 ? 23 : h - 1))}
                        className="px-2 py-1 bg-gray-50 dark:bg-dark-surface2"
                        activeOpacity={0.7}
                      >
                        <Text className="text-base text-gray-700 dark:text-dark-text font-bold">−</Text>
                      </TouchableOpacity>
                      <Text className="px-2 text-sm font-medium text-gray-900 dark:text-dark-text">
                        {String(sleepEnd).padStart(2, '0')}:00
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSleepEnd((h) => (h === 23 ? 0 : h + 1))}
                        className="px-2 py-1 bg-gray-50 dark:bg-dark-surface2"
                        activeOpacity={0.7}
                      >
                        <Text className="text-base text-gray-700 dark:text-dark-text font-bold">+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={saveSleep}
                      disabled={savingSleep}
                      className="ml-auto rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: sleepSaved ? '#d1fae5' : '#c026d3', opacity: savingSleep ? 0.6 : 1 }}
                      activeOpacity={0.8}
                    >
                      {savingSleep ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : sleepSaved ? (
                        <View className="flex-row items-center gap-1">
                          <Check size={12} stroke="#059669" />
                          <Text style={{ color: '#059669', fontSize: 12, fontWeight: '600' }}>Guardado</Text>
                        </View>
                      ) : (
                        <Text className="text-white text-xs font-semibold">Guardar</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Legend */}
                  <View className="flex-row items-center gap-4 mb-3">
                    <View className="flex-row items-center gap-1.5">
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#c7d2fe' }} />
                      <Text className="text-xs text-gris-humo dark:text-dark-text2">Sueño</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#f87171', opacity: 0.6 }} />
                      <Text className="text-xs text-gris-humo dark:text-dark-text2">Ocupado</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: isDark ? '#2E1B5C' : '#f3f4f6', borderWidth: 1, borderColor: isDark ? '#3D2870' : '#e5e7eb' }} />
                      <Text className="text-xs text-gris-humo dark:text-dark-text2">Libre</Text>
                    </View>
                  </View>

                  {/* Grid */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                    <View>
                      {/* Header row */}
                      <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                        <View style={{ width: 32 }} />
                        {GRID_DAYS_SHORT.map((d) => (
                          <View key={d} style={{ width: 36, alignItems: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#A39BBF' : '#6B6880' }}>{d}</Text>
                          </View>
                        ))}
                      </View>
                      {/* Hour rows */}
                      {ALL_HOURS.map((hour) => (
                        <View key={hour} style={{ flexDirection: 'row', marginBottom: 2, alignItems: 'center' }}>
                          <View style={{ width: 32, alignItems: 'flex-end', paddingRight: 4 }}>
                            <Text style={{ fontSize: 9, color: isDark ? '#A39BBF' : '#6B6880', lineHeight: 22 }}>
                              {String(hour).padStart(2, '0')}
                            </Text>
                          </View>
                          {GRID_DAYS_SHORT.map((_, weekday) => {
                            const sleep = isSleepHour(hour, sleepStart, sleepEnd)
                            const busy = !sleep && busyBlocks.has(`${weekday}:${hour}`)
                            const bgColor = sleep
                              ? '#c7d2fe'
                              : busy
                                ? 'rgba(216,90,48,0.55)'
                                : isDark ? '#2E1B5C' : '#f3f4f6'
                            return (
                              <TouchableOpacity
                                key={weekday}
                                onPress={() => toggleBlock(weekday, hour)}
                                disabled={sleep}
                                activeOpacity={sleep ? 1 : 0.6}
                                style={{
                                  width: 34,
                                  height: 22,
                                  marginHorizontal: 1,
                                  borderRadius: 3,
                                  backgroundColor: bgColor,
                                }}
                              />
                            )
                          })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-3">
                    Los cambios se guardan automáticamente al tocar cada bloque.
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
