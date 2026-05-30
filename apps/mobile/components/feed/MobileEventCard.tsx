import { View, Text, TouchableOpacity, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { EVENT_TYPE_LABELS } from '@danceclass/shared'
import type { EventType } from '@danceclass/shared'

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`
}

const TYPE_COLORS: Record<EventType, { bg: string; text: string; darkBg: string; darkText: string }> = {
  batalla: { bg: '#FEF3C7', text: '#D97706', darkBg: '#451a03', darkText: '#FBBF24' },
  masterclass: { bg: '#EDE9FE', text: '#7C3AED', darkBg: '#2e1065', darkText: '#A78BFA' },
  otro: { bg: '#F3F4F6', text: '#6B7280', darkBg: '#1f2937', darkText: '#9CA3AF' },
}

interface MobileEventCardProps {
  event: any
}

export default function MobileEventCard({ event }: MobileEventCardProps) {
  const router = useRouter()
  const { isDark } = useTheme()
  const eventType = (event.event_type ?? 'otro') as EventType
  const typeColors = TYPE_COLORS[eventType]
  const acceptedInvites = (event.event_invites ?? []).filter((i: any) => i.status === 'accepted')
  const enrolledCount = (event.event_enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
  const isFull = event.has_spots && event.max_spots != null && enrolledCount >= event.max_spots

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(app)/event/${event.id}` as any)}
      className="mx-4 mb-4 rounded-2xl overflow-hidden bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border"
      activeOpacity={0.85}
    >
      {/* Cover */}
      {event.cover_url ? (
        <View className="relative w-full" style={{ aspectRatio: 16 / 9 }}>
          <Image
            source={{ uri: event.cover_url }}
            className="w-full h-full"
            resizeMode="cover"
          />
          <View
            className="absolute top-2 left-2 flex-row items-center rounded-full px-2 py-0.5"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          >
            <Text className="text-white text-xs font-semibold">
              {EVENT_TYPE_LABELS[eventType]}
            </Text>
          </View>
          {isFull && (
            <View className="absolute top-2 right-2 rounded-full px-2 py-0.5 bg-red-500">
              <Text className="text-white text-xs font-semibold">Lleno</Text>
            </View>
          )}
        </View>
      ) : (
        <View
          className="w-full items-center justify-center"
          style={{ aspectRatio: 16 / 9, backgroundColor: isDark ? '#241547' : '#EDE9FE' }}
        >
          <Text style={{ fontSize: 40 }}>
            {eventType === 'batalla' ? '🏆' : eventType === 'masterclass' ? '📚' : '⭐'}
          </Text>
          <Text style={{ color: isDark ? '#A78BFA' : '#7C3AED', fontWeight: '700', fontSize: 12, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            {EVENT_TYPE_LABELS[eventType]}
          </Text>
        </View>
      )}

      <View className="p-4 space-y-2">
        {/* Type pill (when no cover) + title */}
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 font-bold text-base text-gray-900 dark:text-dark-text leading-tight" numberOfLines={2}>
            {event.title}
          </Text>
          {!event.cover_url && (
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: isDark ? typeColors.darkBg : typeColors.bg }}>
              <Text style={{ color: isDark ? typeColors.darkText : typeColors.text, fontSize: 11, fontWeight: '600' }}>
                {EVENT_TYPE_LABELS[eventType]}
              </Text>
            </View>
          )}
        </View>

        {/* Date + city */}
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-sm text-gray-500 dark:text-dark-text2">
            📅 {formatEventDate(event.event_date)}
            {event.event_time ? ` · ${event.event_time}` : ''}
          </Text>
          {event.city && (
            <Text className="text-sm text-gray-500 dark:text-dark-text2">📍 {event.city}</Text>
          )}
        </View>

        {/* Accepted teachers */}
        {acceptedInvites.length > 0 && (
          <Text className="text-xs text-violet-600 dark:text-violet-400">
            Con: {acceptedInvites.slice(0, 2).map((i: any) => `@${i.teacher?.username}`).join(', ')}
            {acceptedInvites.length > 2 ? ` +${acceptedInvites.length - 2}` : ''}
          </Text>
        )}

        {/* Footer */}
        <View className="flex-row items-center justify-between pt-1 border-t border-gray-50 dark:border-dark-border" style={{ marginTop: 4 }}>
          {event.has_spots ? (
            <Text className="text-sm text-gray-500 dark:text-dark-text2">
              👥 {enrolledCount}/{event.max_spots} cupos
            </Text>
          ) : (
            <View />
          )}
          {event.has_entry ? (
            <View className="rounded-lg px-2.5 py-1" style={{ backgroundColor: isDark ? '#064e3b' : '#ECFDF5' }}>
              <Text style={{ color: isDark ? '#6EE7B7' : '#065F46', fontWeight: '700', fontSize: 13 }}>
                🎫 {formatCLP(event.entry_price ?? 0)}
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-gray-400 dark:text-dark-text2">Entrada libre</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}
