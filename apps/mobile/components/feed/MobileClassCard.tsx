import { useState, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, ScrollView, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { MapPin, Clock, Users, ChevronRight, ChevronLeft, Music2 } from 'lucide-react-native'
import { DAYS_OF_WEEK, formatCLP } from '@danceclass/shared'
import StarRating from '../ui/StarRating'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

function InlineVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false })
  return (
    <VideoView
      player={player}
      style={{ width: SCREEN_WIDTH, aspectRatio: 1 }}
      contentFit="contain"
      allowsFullscreen
      allowsPictureInPicture={false}
    />
  )
}

interface MobileClassCardProps {
  classData: any
  currentUserId: string
  compact?: boolean
  teacherRating?: { avg_stars: number; rating_count: number }
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
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function MobileClassCard({ classData, currentUserId, compact = false, teacherRating }: MobileClassCardProps) {
  const router = useRouter()
  const [mediaIndex, setMediaIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const teacher = classData.teacher
  const media = [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  const isOwner = classData.teacher_id === currentUserId

  const schedule = classData.type === 'suelta'
    ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
    : `${DAYS_OF_WEEK[classData.day_of_week]} · ${formatTime(classData.recurring_time)}`

  // Compact layout — used on own profile
  if (compact) {
    const firstMedia = media[0]
    return (
      <View className="mx-4 mb-3 bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden flex-row">
        <TouchableOpacity
          onPress={() => router.push(`/(app)/class/${classData.id}` as any)}
          className="flex-row gap-3 p-3 flex-1"
          activeOpacity={0.7}
        >
          {/* Thumbnail */}
          <View className="rounded-xl bg-brand-50 dark:bg-dark-surface2 items-center justify-center overflow-hidden flex-shrink-0" style={{ width: 64, height: 64 }}>
            {firstMedia ? (
              firstMedia.type === 'video' ? (
                <View style={{ width: 64, height: 64 }} className="bg-gray-900 items-center justify-center">
                  <Music2 size={20} stroke="white" />
                </View>
              ) : (
                <Image source={{ uri: firstMedia.url }} style={{ width: 64, height: 64 }} resizeMode="cover" />
              )
            ) : (
              <Music2 size={24} stroke="#c026d3" />
            )}
          </View>

          {/* Info */}
          <View className="flex-1 justify-center gap-0.5">
            <Text className="font-bold text-gray-900 dark:text-dark-text text-sm" numberOfLines={1}>
              {classData.title}
            </Text>
            {classData.dance_style && (
              <Text className="text-xs text-gris-humo dark:text-dark-text2">
                {classData.dance_style}{classData.class_type ? ` · ${classData.class_type}` : ''}
              </Text>
            )}
            <Text className="text-xs" style={{ color: '#7F77DD' }}>{schedule}</Text>
            <Text className="text-sm font-bold text-gray-900 dark:text-dark-text">{formatCLP(classData.price)}</Text>
          </View>
        </TouchableOpacity>

        {/* Edit button — right side */}
        <TouchableOpacity
          onPress={() => router.push(`/(app)/class/${classData.id}/edit` as any)}
          className="justify-center px-4"
        >
          <Text className="text-brand-600 text-xs font-semibold">Editar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(media.length - 1, index))
    scrollRef.current?.scrollTo({ x: clamped * SCREEN_WIDTH, animated: true })
    setMediaIndex(clamped)
  }

  return (
    <View className="border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
      {/* Header — not navigable when viewing own class (prevents loop) */}
      <TouchableOpacity
        onPress={() => !isOwner && router.push(`/(app)/teacher/${teacher.username}` as any)}
        activeOpacity={isOwner ? 1 : 0.7}
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
          <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{teacher.full_name}</Text>
          <View className="flex-row items-center gap-1.5">
            {teacherRating && teacherRating.rating_count > 0 && (
              <StarRating value={teacherRating.avg_stars} count={teacherRating.rating_count} size="sm" />
            )}
            <Text className="text-xs text-gris-humo dark:text-dark-text2">{timeAgo(classData.created_at)}</Text>
          </View>
        </View>
        {classData.dance_style && (
          <View className="bg-brand-50 rounded-full px-2.5 py-1">
            <Text className="text-brand-700 text-xs font-medium">{classData.dance_style}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Media carousel */}
      {media.length > 0 && (
        <View style={{ width: SCREEN_WIDTH, aspectRatio: 1 }} className="bg-gray-900">
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e: any) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
              setMediaIndex(index)
            }}
          >
            {media.map((item: any) => (
              <View key={item.id} style={{ width: SCREEN_WIDTH, aspectRatio: 1 }}>
                {item.type === 'video' ? (
                  <InlineVideo url={item.url} />
                ) : (
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: SCREEN_WIDTH, aspectRatio: 1 }}
                    resizeMode="cover"
                  />
                )}
              </View>
            ))}
          </ScrollView>

          {media.length > 1 && (
            <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center gap-2">
              <TouchableOpacity
                onPress={() => goTo(mediaIndex - 1)}
                disabled={mediaIndex === 0}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronLeft size={20} stroke={mediaIndex === 0 ? 'rgba(255,255,255,0.25)' : 'white'} />
              </TouchableOpacity>
              {media.map((_: any, i: number) => (
                <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <View className={`h-2 rounded-full ${i === mediaIndex ? 'w-5 bg-white' : 'w-2 bg-white/50'}`} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => goTo(mediaIndex + 1)}
                disabled={mediaIndex === media.length - 1}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronRight size={20} stroke={mediaIndex === media.length - 1 ? 'rgba(255,255,255,0.25)' : 'white'} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Content */}
      <View className="px-4 pb-4 pt-3 gap-2">
        <Text className="font-bold text-gray-900 dark:text-dark-text text-base">{classData.title}</Text>

        {classData.description && (
          <Text className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed" numberOfLines={3}>
            {classData.description}
          </Text>
        )}

        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Clock size={14} stroke="#9ca3af" />
            <Text className="text-sm text-gris-humo dark:text-dark-text2">{schedule} · {classData.duration_minutes} min</Text>
          </View>
          {classData.location_name && (
            <View className="flex-row items-center gap-2">
              <MapPin size={14} stroke="#9ca3af" />
              <Text className="text-sm text-gris-humo dark:text-dark-text2">{classData.location_name}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-2">
            <Users size={14} stroke="#9ca3af" />
            {(() => {
              const taken = (classData.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
              const available = Math.max(0, (classData.max_spots ?? 0) - taken)
              return (
                <Text className={`text-sm ${available <= 0 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gris-humo dark:text-dark-text2'}`}>
                  {available <= 0 ? 'Sin cupos disponibles' : `${available}/${classData.max_spots} cupos`}
                </Text>
              )
            })()}
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">{formatCLP(classData.price)}</Text>
          {isOwner ? (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/class/${classData.id}/edit` as any)}
              className="flex-row items-center gap-1.5 border border-brand-300 rounded-xl px-4 py-2"
            >
              <Text className="text-brand-600 font-semibold text-sm">Editar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/class/${classData.id}` as any)}
              className="flex-row items-center gap-1.5 bg-brand-600 rounded-xl px-4 py-2"
            >
              <Text className="text-white font-semibold text-sm">Ver clase</Text>
              <ChevronRight size={16} stroke="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}
