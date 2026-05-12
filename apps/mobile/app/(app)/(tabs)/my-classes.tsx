import { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { DAYS_OF_WEEK } from '@danceclass/shared'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: 'text-gray-500' },
  payment_submitted: { label: 'Verificando pago', color: 'text-yellow-600' },
  confirmed: { label: '✓ Confirmado', color: 'text-green-600' },
}

export default function MyClassesScreen() {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('enrollments')
        .select('*, class:classes(*, teacher:profiles!teacher_id(*))')
        .eq('student_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
      setEnrollments(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <SafeAreaView className="flex-1 items-center justify-center">
      <ActivityIndicator color="#c026d3" />
    </SafeAreaView>
  )

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Mis clases</Text>
      </View>

      <FlatList
        data={enrollments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📚</Text>
            <Text className="text-gray-500 text-sm">Sin clases inscritas</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cls = item.class
          const teacher = cls?.teacher
          const config = STATUS_LABELS[item.status] ?? { label: item.status, color: 'text-gray-500' }
          const schedule = cls?.type === 'suelta'
            ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
            : `${DAYS_OF_WEEK[cls?.day_of_week]} · ${formatTime(cls?.recurring_time)}`

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/class/${cls?.id}` as any)}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm"
            >
              <Text className="font-bold text-gray-900">{cls?.title}</Text>
              <Text className="text-xs text-gray-500 mt-0.5">{teacher?.full_name}</Text>
              <Text className="text-xs text-gray-500 mt-1">{schedule}</Text>
              <Text className={`text-xs font-medium mt-2 ${config.color}`}>{config.label}</Text>
              {item.status === 'pending_payment' && (
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/payment/${item.id}` as any)}
                  className="mt-2 bg-brand-600 rounded-xl py-2 items-center"
                >
                  <Text className="text-white font-semibold text-sm">Ir a pagar</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}
