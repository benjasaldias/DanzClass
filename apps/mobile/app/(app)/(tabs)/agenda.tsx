import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, ChevronDown } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getClassSessions, toYMD, formatTime } from '../../../lib/utils'
import { useTheme } from '../../../context/ThemeContext'
import { canTeach } from '@danceclass/shared'
import TopBar from '../../../components/ui/TopBar'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface AgendaEvent {
  classId: string
  title: string
  style?: string
  time?: string
  teacher?: string
  isTeaching: boolean
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

const DAYS_AVAIL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
  const [weekStart, setWeekStart] = useState(getWeekStart(today))
  const [availOpen, setAvailOpen] = useState(false)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: tier }, { data: enrollments }, { data: teaching }] = await Promise.all([
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
    ])

    const currentTier = tier?.tier ?? 'none'
    const enrolled = (enrollments ?? []).map((e: any) => e.class).filter(Boolean)
    const teach = canTeach(currentTier) ? (teaching ?? []) : []
    const teachIds = new Set(teach.map((c: any) => c.id))
    setEnrolledClasses(enrolled.filter((c: any) => !teachIds.has(c.id)))
    setTeachingClasses(teach)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
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

    return map
  }, [enrolledClasses, teachingClasses, weekStart])

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
        <View className="flex-row items-center gap-4 px-4 py-2 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7F77DD' }} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Inscritas</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#c026d3' }} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">Que dicto</Text>
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
                    <Text className="text-xs text-gris-humo dark:text-dark-text2 py-1">Sin clases</Text>
                  ) : (
                    events.map((ev, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => router.push(`/(app)/class/${ev.classId}` as any)}
                        className={`flex-row items-start gap-3 p-2.5 rounded-xl mb-1 ${
                          ev.isTeaching
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
                            backgroundColor: ev.isTeaching ? '#c026d3' : '#7F77DD',
                            flexShrink: 0,
                          }}
                        />
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text" numberOfLines={1}>
                            {ev.title}
                          </Text>
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
                          {ev.isTeaching ? (
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

        {/* ── Disponibilidad personal ──────────────────── */}
        <View className="mx-3 mt-1 mb-4 border border-gray-100 dark:border-dark-border rounded-xl overflow-hidden">
          <TouchableOpacity
            onPress={() => setAvailOpen((o) => !o)}
            className="flex-row items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-surface2"
            activeOpacity={0.7}
          >
            <View>
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">Mis días disponibles</Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">Marca los días en que puedes tomar clases</Text>
            </View>
            <ChevronDown
              size={16}
              stroke={isDark ? '#A39BBF' : '#9ca3af'}
              style={{ transform: [{ rotate: availOpen ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
          {availOpen && (
            <View className="px-4 py-3 bg-white dark:bg-dark-surface">
              <View className="flex-row flex-wrap gap-2">
                {DAYS_AVAIL.map((day) => (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setAvailability((p) => ({ ...p, [day]: !p[day] }))}
                    className={`px-3 py-1.5 rounded-full border ${
                      availability[day]
                        ? 'bg-brand-600 border-brand-600'
                        : 'border-gray-200 dark:border-dark-border'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className={`text-xs font-medium ${availability[day] ? 'text-white' : 'text-gray-600 dark:text-dark-text2'}`}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-2">
                Esta información se usará próximamente para sugerirte clases que calcen con tu horario.
              </Text>
              <Text className="text-xs text-gris-humo/60 dark:text-dark-text2/50 italic mt-1">
                Nota: la disponibilidad aún no se guarda.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
