import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, TrendingUp, Users, BookOpen, DollarSign } from 'lucide-react-native'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { canTeach } from '@danceclass/shared'
import Avatar from '../../components/ui/Avatar'

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatCLP(amount: number) {
  return `$${amount.toLocaleString('es-CL')}`
}

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(key: string) {
  const [year, month] = key.split('-')
  return `${MONTHS_ES[Number(month) - 1]} ${year.slice(2)}`
}

function getLast6MonthKeys() {
  const keys: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export default function FinancieroScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [payments, setPayments] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [paymentsRes, classesRes] = await Promise.all([
      (supabase as any)
        .from('payments')
        .select(`
          id, amount, status, created_at,
          enrollment:enrollments!inner(
            id, student_id, class_id, status,
            student:profiles!student_id(id, full_name, username, avatar_url),
            class:classes!inner(id, title, dance_style, type, teacher_id)
          )
        `)
        .eq('enrollment.class.teacher_id', user.id)
        .eq('status', 'verified')
        .order('created_at', { ascending: false }),

      (supabase as any)
        .from('classes')
        .select(`id, title, dance_style, enrollments(id, status, student_id)`)
        .eq('teacher_id', user.id)
        .in('status', ['active', 'completed']),
    ])

    setPayments(paymentsRes.data ?? [])
    setClasses(classesRes.data ?? [])
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const last6 = getLast6MonthKeys()
  const currentKey = last6[5]

  const totalIncome = payments.reduce((acc, p) => acc + (p.amount ?? 0), 0)
  const uniqueStudents = new Set(payments.map((p) => p.enrollment?.student_id)).size
  const activeCount = classes.length
  const totalEnrolled = classes.reduce((acc, c) => acc + (c.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length, 0)
  const totalConfirmed = classes.reduce((acc, c) => acc + (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').length, 0)
  const conversionRate = totalEnrolled > 0 ? Math.round((totalConfirmed / totalEnrolled) * 100) : 0

  const monthlyTrend = last6.map((key) => {
    const total = payments.filter((p) => getMonthKey(p.created_at) === key).reduce((acc, p) => acc + (p.amount ?? 0), 0)
    return { key, label: getMonthLabel(key), total }
  })
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.total), 1)

  const topClasses = useMemo(() => {
    const map: Record<string, { title: string; income: number; count: number }> = {}
    for (const p of payments) {
      const cls = p.enrollment?.class
      if (!cls) continue
      if (!map[cls.id]) map[cls.id] = { title: cls.title, income: 0, count: 0 }
      map[cls.id].income += p.amount ?? 0
      map[cls.id].count++
    }
    return Object.entries(map).sort((a, b) => b[1].income - a[1].income).slice(0, 5)
  }, [payments])

  const recentPayments = payments.slice(0, 10)

  const cardBg = isDark ? 'bg-dark-surface' : 'bg-white'
  const borderColor = isDark ? 'border-dark-border' : 'border-gray-100'
  const textPrimary = isDark ? 'text-dark-text' : 'text-gray-900'
  const textSecondary = isDark ? 'text-dark-text2' : 'text-gray-500'

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-dark-bg" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7F77DD" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <ChevronLeft stroke={isDark ? '#EEEDFE' : '#374151'} size={22} />
        </TouchableOpacity>
        <View>
          <Text className={`text-lg font-bold ${textPrimary}`}>Panel Financiero</Text>
          <Text className={`text-xs ${textSecondary}`}>Ingresos y actividad</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7F77DD" />}
      >
        {/* Stat cards 2x2 */}
        <View className="flex-row gap-3 mb-4">
          <View className={`flex-1 ${cardBg} border ${borderColor} rounded-2xl p-3`}>
            <View className="bg-emerald-50 dark:bg-emerald-900/20 h-9 w-9 rounded-xl items-center justify-center mb-2">
              <DollarSign stroke={isDark ? '#6ee7b7' : '#059669'} size={18} />
            </View>
            <Text className={`text-xs ${textSecondary}`}>Ingresos totales</Text>
            <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(totalIncome)}</Text>
          </View>
          <View className={`flex-1 ${cardBg} border ${borderColor} rounded-2xl p-3`}>
            <View className="bg-blue-50 dark:bg-blue-900/20 h-9 w-9 rounded-xl items-center justify-center mb-2">
              <Users stroke={isDark ? '#93c5fd' : '#2563eb'} size={18} />
            </View>
            <Text className={`text-xs ${textSecondary}`}>Alumnos únicos</Text>
            <Text className={`text-sm font-bold ${textPrimary}`}>{uniqueStudents}</Text>
          </View>
        </View>
        <View className="flex-row gap-3 mb-5">
          <View className={`flex-1 ${cardBg} border ${borderColor} rounded-2xl p-3`}>
            <View className="bg-violet-50 dark:bg-violet-900/20 h-9 w-9 rounded-xl items-center justify-center mb-2">
              <BookOpen stroke={isDark ? '#c4b5fd' : '#7c3aed'} size={18} />
            </View>
            <Text className={`text-xs ${textSecondary}`}>Clases activas</Text>
            <Text className={`text-sm font-bold ${textPrimary}`}>{activeCount}</Text>
            <Text className={`text-[11px] ${textSecondary}`}>{totalEnrolled} inscripciones</Text>
          </View>
          <View className={`flex-1 ${cardBg} border ${borderColor} rounded-2xl p-3`}>
            <View className="bg-brand-50 dark:bg-brand-950/30 h-9 w-9 rounded-xl items-center justify-center mb-2">
              <TrendingUp stroke={isDark ? '#c4b5fd' : '#7c3aed'} size={18} />
            </View>
            <Text className={`text-xs ${textSecondary}`}>Tasa de pago</Text>
            <Text className={`text-sm font-bold ${textPrimary}`}>{conversionRate}%</Text>
            <Text className={`text-[11px] ${textSecondary}`}>inscritos con pago</Text>
          </View>
        </View>

        {/* Monthly trend */}
        <View className={`${cardBg} border ${borderColor} rounded-2xl p-4 mb-5`}>
          <Text className={`text-sm font-semibold ${textPrimary} mb-3`}>Ingresos últimos 6 meses</Text>
          <View className="flex-row items-end gap-1.5" style={{ height: 80 }}>
            {monthlyTrend.map((m) => {
              const pct = maxMonthly > 0 ? m.total / maxMonthly : 0
              const barH = Math.max(pct * 60, m.total > 0 ? 6 : 2)
              const isCurrent = m.key === currentKey
              return (
                <View key={m.key} className="flex-1 items-center gap-1">
                  <View className="flex-1 justify-end w-full">
                    <View
                      style={{ height: barH, borderRadius: 4, backgroundColor: isCurrent ? '#8b5cf6' : isDark ? '#3D2870' : '#e5e7eb' }}
                    />
                  </View>
                  <Text style={{ fontSize: 9, color: isCurrent ? '#7c3aed' : isDark ? '#A39BBF' : '#9ca3af', fontWeight: isCurrent ? '700' : '400' }}>
                    {m.label}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Recent payments */}
        {recentPayments.length > 0 && (
          <View className="mb-5">
            <Text className={`text-sm font-semibold ${textPrimary} mb-3`}>Pagos recientes</Text>
            <View className="gap-2">
              {recentPayments.map((p) => {
                const student = p.enrollment?.student
                const cls = p.enrollment?.class
                const date = new Date(p.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                return (
                  <View key={p.id} className={`${cardBg} border ${borderColor} rounded-xl p-3 flex-row items-center gap-3`}>
                    <Avatar src={student?.avatar_url} name={student?.full_name ?? '?'} size="sm" />
                    <View className="flex-1 min-w-0">
                      <Text className={`text-sm font-semibold ${textPrimary}`} numberOfLines={1}>{student?.full_name}</Text>
                      <Text className={`text-xs ${textSecondary}`} numberOfLines={1}>{cls?.title}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(p.amount)}</Text>
                      <Text className={`text-[10px] ${textSecondary}`}>{date}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Top classes */}
        {topClasses.length > 0 && (
          <View className={`${cardBg} border ${borderColor} rounded-2xl p-4`}>
            <Text className={`text-sm font-semibold ${textPrimary} mb-3`}>Top clases por ingreso</Text>
            <View className="gap-3">
              {topClasses.map(([id, data], i) => (
                <View key={id} className="flex-row items-center gap-3">
                  <View style={{
                    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: i === 0 ? '#fef3c7' : i === 1 ? isDark ? '#3D2870' : '#f3f4f6' : '#fff7ed',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 ? '#b45309' : i === 1 ? '#6b7280' : '#c2410c' }}>{i + 1}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className={`text-sm font-medium ${textPrimary}`} numberOfLines={1}>{data.title}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(data.income)}</Text>
                    <Text className={`text-[10px] ${textSecondary}`}>{data.count} pagos</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {payments.length === 0 && (
          <View className="items-center py-16">
            <TrendingUp stroke={isDark ? '#A39BBF' : '#d1d5db'} size={40} />
            <Text className={`text-sm ${textSecondary} mt-3`}>Sin pagos confirmados aún</Text>
            <Text className={`text-xs ${textSecondary} mt-1 text-center max-w-xs`}>Cuando confirmes pagos de tus alumnos, aquí verás tus estadísticas financieras.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
