import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
  Image, Modal, Pressable, Alert, Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  ChevronLeft, MapPin, Clock, Users, Calendar, ChevronDown,
  ChevronRight, AlertCircle, CheckCircle2, Tag, Music2,
} from 'lucide-react-native'
import { Icon } from '../../../../components/ui/Icon'
import { supabase } from '../../../../lib/supabase'
import { formatCLP, DAYS_OF_WEEK, canEnroll } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  principiante: { bg: '#dcfce7', text: '#15803d' },
  intermedio: { bg: '#fef9c3', text: '#a16207' },
  avanzado: { bg: '#fee2e2', text: '#dc2626' },
  todos: { bg: '#dbeafe', text: '#1d4ed8' },
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function CustomDatesModal({ dates, time, onClose }: { dates: string[]; time: string; onClose: () => void }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <View className="bg-white rounded-t-3xl p-6" style={{ maxHeight: '70%' }}>
          <Text className="text-lg font-bold text-gray-900 mb-4">Fechas programadas</Text>
          <ScrollView>
            {dates.sort().map((d) => (
              <View key={d} className="flex-row items-center gap-3 py-3 border-b border-gray-100">
                <View className="w-8 h-8 rounded-full bg-brand-50 items-center justify-center">
                  <Calendar size={14} stroke="#c026d3" />
                </View>
                <Text className="text-sm text-gray-800">{formatDate(d)} · {formatTime(time)}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} className="mt-4 bg-brand-600 rounded-xl py-3 items-center">
            <Text className="text-white font-semibold">Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

function VideoCarouselItem({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false })
  return (
    <VideoView
      player={player}
      style={{ width: SCREEN_WIDTH, minHeight: 240, maxHeight: 400 }}
      contentFit="contain"
      allowsFullscreen
    />
  )
}

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [cls, setCls] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [enrollment, setEnrollment] = useState<any>(null)
  const [spots, setSpots] = useState<any>(null)
  const [mediaIndex, setMediaIndex] = useState(0)
  const [showDates, setShowDates] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const carouselRef = useRef<ScrollView>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [clsRes, subRes, spotsRes] = await Promise.all([
        (supabase as any)
          .from('classes')
          .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
          .eq('id', id)
          .single(),
        supabase.from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').single(),
        (supabase as any).from('class_spots').select('*').eq('class_id', id).maybeSingle(),
      ])

      setCls(clsRes.data)
      setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
      setSpots(spotsRes.data)

      // Check if user already enrolled
      const { data: existing } = await supabase
        .from('enrollments')
        .select('*, payment:payments(*)')
        .eq('student_id', user.id)
        .eq('class_id', id)
        .neq('status', 'cancelled')
        .maybeSingle()
      setEnrollment(existing)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  if (!cls) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <Text className="text-gray-500">Clase no encontrada</Text>
      </SafeAreaView>
    )
  }

  const teacher = cls.teacher
  const media = [...(cls.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  const isTeacher = cls.teacher_id === userId
  const isPeriodic = cls.type === 'periodica' || cls.type === 'entrenamiento'
  const isCustom = cls.recurrence === 'custom'
  const spotsAvailable = spots?.spots_available ?? cls.max_spots
  const isFull = spotsAvailable <= 0
  const levelColors = LEVEL_COLORS[cls.level] ?? { bg: '#f3f4f6', text: '#374151' }

  const activePrice = isPeriodic
    ? (cls.discount_price_monthly ?? cls.price)
    : (cls.discount_price ?? cls.price)
  const hasDiscount = activePrice < cls.price

  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const scheduleText = cls.type === 'suelta'
    ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
    : isCustom
      ? `${cls.custom_dates?.length ?? 0} clases programadas · ${formatTime(cls.recurring_time)}`
      : `${recurrenceLabel[cls.recurrence] ?? ''} · ${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`

  async function handleEnroll() {
    if (!userId || isFull) return
    setEnrolling(true)
    const { data, error } = await (supabase as any)
      .from('enrollments')
      .insert({ student_id: userId, class_id: cls.id, session_id: null, status: 'pending_payment' })
      .select('*, payment:payments(*)')
      .single()
    if (error) {
      Alert.alert('Error', 'No se pudo inscribir. Intenta nuevamente.')
      setEnrolling(false)
      return
    }
    setEnrollment(data)
    setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available - 1 } : prev)
    setEnrolling(false)
    router.push(`/(app)/payment/${data.id}` as any)
  }

  async function handleLeave() {
    if (!userId || !enrollment) return
    Alert.alert(
      'Salir de la clase',
      '¿Estás seguro? Perderás tu lugar y deberás reinscribirte.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true)
            await supabase.from('enrollments').update({ status: 'cancelled' }).eq('id', enrollment.id)
            setEnrollment(null)
            setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available + 1 } : prev)
            setLeaving(false)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900 dark:text-dark-text flex-1" numberOfLines={1}>{cls.title}</Text>
        {isTeacher && (
          <TouchableOpacity onPress={() => router.push(`/(app)/class/${cls.id}/edit` as any)}>
            <Text className="text-brand-600 text-sm font-semibold">Editar</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Media carousel */}
        {media.length > 0 ? (
          <View className="bg-black" style={{ minHeight: 240 }}>
            <ScrollView
              ref={carouselRef}
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
                <View key={item.id} style={{ width: SCREEN_WIDTH, minHeight: 240 }} className="bg-black items-center justify-center">
                  {item.type === 'video' ? (
                    <VideoCarouselItem url={item.url} />
                  ) : (
                    <Image
                      source={{ uri: item.url }}
                      style={{ width: SCREEN_WIDTH, minHeight: 240, maxHeight: 420 }}
                      resizeMode="contain"
                    />
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Indicator bar: ‹ dots › */}
            {media.length > 1 && (
              <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center gap-2">
                <TouchableOpacity
                  onPress={() => {
                    const next = Math.max(0, mediaIndex - 1)
                    carouselRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setMediaIndex(next)
                  }}
                  disabled={mediaIndex === 0}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ChevronLeft size={22} stroke={mediaIndex === 0 ? 'rgba(255,255,255,0.25)' : 'white'} />
                </TouchableOpacity>

                {media.map((_: any, i: number) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      carouselRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true })
                      setMediaIndex(i)
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <View className={`h-2 rounded-full ${i === mediaIndex ? 'w-5 bg-white' : 'w-2 bg-white/50'}`} />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  onPress={() => {
                    const next = Math.min(media.length - 1, mediaIndex + 1)
                    carouselRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setMediaIndex(next)
                  }}
                  disabled={mediaIndex === media.length - 1}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ChevronRight size={22} stroke={mediaIndex === media.length - 1 ? 'rgba(255,255,255,0.25)' : 'white'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View className="items-center justify-center bg-gray-100 dark:bg-dark-surface2" style={{ height: 160 }}>
            <Icon icon={Music2} size={40} />
          </View>
        )}

        {/* Discount banner */}
        {hasDiscount && (
          <View className="flex-row items-center gap-2 bg-coral-fuego px-4 py-2">
            <Tag size={14} stroke="white" />
            <Text className="text-white text-sm font-semibold">¡Descuento activo!</Text>
          </View>
        )}

        <View className="px-4 pt-4 gap-4">
          {/* Teacher row */}
          <TouchableOpacity
            onPress={() => teacher?.username && router.push(`/(app)/teacher/${teacher.username}` as any)}
            className="flex-row items-center gap-3"
          >
            {teacher?.avatar_url ? (
              <Image source={{ uri: teacher.avatar_url }} className="w-10 h-10 rounded-full" />
            ) : (
              <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 font-bold text-sm">
                  {(teacher?.full_name ?? '').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                </Text>
              </View>
            )}
            <View>
              <Text className="font-semibold text-gray-900 dark:text-dark-text text-sm">{teacher?.full_name}</Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2">@{teacher?.username}</Text>
            </View>
            <ChevronRight size={16} stroke="#9ca3af" />
          </TouchableOpacity>

          {/* Title + badges */}
          <View>
            <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">{cls.title}</Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {cls.dance_style && (
                <View className="bg-brand-50 rounded-full px-3 py-1">
                  <Text className="text-brand-700 text-xs font-medium">{cls.dance_style}</Text>
                </View>
              )}
              {cls.class_type && (
                <View className="bg-morado-flow/10 rounded-full px-3 py-1">
                  <Text className="text-xs font-medium" style={{ color: '#7F77DD' }}>{cls.class_type}</Text>
                </View>
              )}
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: levelColors.bg }}>
                <Text className="text-xs font-medium" style={{ color: levelColors.text }}>{cls.level}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {cls.description && (
            <Text className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed">{cls.description}</Text>
          )}

          {/* Info rows */}
          <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
            <View className="flex-row items-center gap-3">
              <Clock size={16} stroke="#6B6880" />
              <View className="flex-1">
                <Text className="text-sm text-gray-800 dark:text-dark-text">{scheduleText}</Text>
                <Text className="text-xs text-gris-humo dark:text-dark-text2">{cls.duration_minutes} minutos</Text>
              </View>
              {isCustom && (
                <TouchableOpacity
                  onPress={() => setShowDates(true)}
                  className="flex-row items-center gap-1 bg-brand-50 rounded-xl px-3 py-1.5"
                >
                  <Calendar size={12} stroke="#c026d3" />
                  <Text className="text-xs text-brand-700 font-medium">Ver fechas</Text>
                </TouchableOpacity>
              )}
            </View>
            {cls.location_name && (
              <View className="flex-row items-center gap-3">
                <MapPin size={16} stroke="#6B6880" />
                <View className="flex-1">
                  <Text className="text-sm text-gray-800 dark:text-dark-text">{cls.location_name}</Text>
                  {cls.location_address && <Text className="text-xs text-gris-humo dark:text-dark-text2">{cls.location_address}</Text>}
                </View>
              </View>
            )}
            <View className="flex-row items-center gap-3">
              <Users size={16} stroke="#6B6880" />
              <Text className={`text-sm ${isFull ? 'text-red-600' : spotsAvailable <= 3 ? 'text-orange-600' : 'text-gray-800 dark:text-dark-text'}`}>
                {isFull ? 'Sin cupos disponibles' : `${spotsAvailable} de ${cls.max_spots} cupos disponibles`}
              </Text>
            </View>
          </View>

          {/* Price section */}
          <View className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 gap-2">
            <View className="flex-row items-end gap-3">
              <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">{formatCLP(activePrice)}</Text>
              {hasDiscount && (
                <Text className="text-sm text-gray-400 dark:text-dark-text2/50 line-through mb-0.5">{formatCLP(cls.price)}</Text>
              )}
              {isPeriodic && <Text className="text-sm text-gray-500 dark:text-dark-text2 mb-0.5">/mes</Text>}
            </View>
            {isPeriodic && cls.price_suelta && (
              <Text className="text-sm text-gray-600 dark:text-dark-text2">
                Suelta: {formatCLP(cls.discount_price ?? cls.price_suelta)}
                {cls.discount_price && cls.discount_price < cls.price_suelta && (
                  <Text className="text-gray-400 line-through"> {formatCLP(cls.price_suelta)}</Text>
                )}
              </Text>
            )}

            {/* CTA */}
            {!isTeacher && (
              enrollment ? (
                <View className="gap-2 mt-1">
                  <View className="flex-row items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <CheckCircle2 size={14} stroke="#16a34a" />
                    <Text className="text-xs text-green-700 font-medium flex-1">
                      {enrollment.status === 'confirmed'
                        ? 'Inscrit@ — pago confirmado'
                        : enrollment.status === 'payment_submitted'
                          ? 'Pago enviado — esperando confirmación'
                          : 'Inscrit@ — pago pendiente'}
                    </Text>
                  </View>
                  {enrollment.status === 'pending_payment' && (
                    <TouchableOpacity
                      onPress={() => router.push(`/(app)/payment/${enrollment.id}` as any)}
                      className="bg-brand-600 rounded-xl py-3 items-center"
                    >
                      <Text className="text-white font-semibold">Enviar comprobante</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleLeave} disabled={leaving} className="py-2 items-center">
                    <Text className="text-xs text-red-500">
                      {leaving ? 'Saliendo...' : 'Salir de la clase'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleEnroll}
                  disabled={enrolling || isFull || !canEnroll(tier)}
                  className={`rounded-xl py-3 items-center mt-1 ${isFull || !canEnroll(tier) ? 'bg-gray-200' : 'bg-brand-600'}`}
                >
                  <Text className={`font-semibold ${isFull || !canEnroll(tier) ? 'text-gray-500' : 'text-white'}`}>
                    {enrolling ? 'Inscribiendo...' :
                     isFull ? 'Sin cupos' :
                     !canEnroll(tier) ? 'Necesitas un plan' :
                     'Reservar lugar'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </ScrollView>

      {/* Custom dates modal */}
      {showDates && isCustom && (
        <CustomDatesModal
          dates={cls.custom_dates ?? []}
          time={cls.recurring_time}
          onClose={() => setShowDates(false)}
        />
      )}
    </SafeAreaView>
  )
}
