import { useState } from 'react'
import { View, Text, Image, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, Clock, Users, ChevronRight } from 'lucide-react-native'
import { DAYS_OF_WEEK, formatCLP } from '@danceclass/shared'

interface MobileClassCardProps {
  classData: any
  currentUserId: string
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function MobileClassCard({ classData, currentUserId }: MobileClassCardProps) {
  const router = useRouter()
  const [mediaIndex, setMediaIndex] = useState(0)
  const teacher = classData.teacher
  const media = [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)

  const schedule = classData.type === 'suelta'
    ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
    : `${DAYS_OF_WEEK[classData.day_of_week]} · ${formatTime(classData.recurring_time)}`

  return (
    <View className="border-b border-gray-100 bg-white">
      {/* Header */}
      <TouchableOpacity
        onPress={() => router.push(`/(app)/teacher/${teacher.username}`)}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
          {teacher.avatar_url ? (
            <Image source={{ uri: teacher.avatar_url }} className="w-10 h-10 rounded-full" />
          ) : (
            <Text className="text-brand-700 font-bold text-sm">
              {teacher.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">{teacher.full_name}</Text>
          <Text className="text-xs text-gris-humo">{timeAgo(classData.created_at)}</Text>
        </View>
        {classData.dance_style && (
          <View className="bg-brand-50 rounded-full px-2.5 py-1">
            <Text className="text-brand-700 text-xs font-medium">{classData.dance_style}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Media */}
      {media.length > 0 && (
        <View className="aspect-square bg-gray-100">
          <Image
            source={{ uri: media[mediaIndex].url }}
            className="w-full h-full"
            resizeMode="cover"
          />
          {media.length > 1 && (
            <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
              {media.map((_: any, i: number) => (
                <TouchableOpacity key={i} onPress={() => setMediaIndex(i)}>
                  <View className={`h-1.5 rounded-full ${i === mediaIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Content */}
      <View className="px-4 pb-4 pt-3 gap-2">
        <Text className="font-bold text-gray-900 text-base">{classData.title}</Text>

        {classData.description && (
          <Text className="text-sm text-gray-600 leading-relaxed" numberOfLines={3}>
            {classData.description}
          </Text>
        )}

        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Clock size={14} color="#9ca3af" />
            <Text className="text-sm text-gris-humo">{schedule} · {classData.duration_minutes} min</Text>
          </View>
          {classData.location_name && (
            <View className="flex-row items-center gap-2">
              <MapPin size={14} color="#9ca3af" />
              <Text className="text-sm text-gris-humo">{classData.location_name}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-2">
            <Users size={14} color="#9ca3af" />
            <Text className="text-sm text-gris-humo">Cupos: {classData.max_spots}</Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-2xl font-bold text-gray-900">{formatCLP(classData.price)}</Text>
          {classData.teacher_id !== currentUserId && (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/class/${classData.id}`)}
              className="flex-row items-center gap-1.5 bg-brand-600 rounded-xl px-4 py-2"
            >
              <Text className="text-white font-semibold text-sm">Ver clase</Text>
              <ChevronRight size={16} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}
