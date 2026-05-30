import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../../lib/supabase'
import { useTheme } from '../../../../context/ThemeContext'
import { EVENT_TYPE_LABELS } from '@danceclass/shared'
import type { EventType } from '@danceclass/shared'
import Avatar from '../../../../components/ui/Avatar'

function formatCLP(n: number) { return `$${n.toLocaleString('es-CL')}` }
function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { isDark } = useTheme()
  const [event, setEvent] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [myEnrollment, setMyEnrollment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const [{ data: ev }, enrollRes] = await Promise.all([
        (supabase as any)
          .from('events')
          .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher:profiles!teacher_id(id, username, full_name, avatar_url)), event_enrollments(id, user_id, status)')
          .eq('id', id)
          .single(),
        user ? (supabase as any)
          .from('event_enrollments')
          .select('id, status')
          .eq('event_id', id)
          .eq('user_id', user.id)
          .maybeSingle()
          : { data: null },
      ])

      setEvent(ev)
      setMyEnrollment(enrollRes.data)
      setLoading(false)
    }
    if (id) load()
  }, [id])

  async function handleEnroll() {
    if (!userId) { Alert.alert('', 'Inicia sesión para inscribirte'); return }
    if (!event) return
    setEnrolling(true)
    try {
      const { data, error } = await (supabase as any)
        .from('event_enrollments')
        .insert({ event_id: event.id, user_id: userId })
        .select('id, status')
        .single()
      if (error) throw error
      setMyEnrollment(data)
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo inscribir')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleRespondInvite(status: 'accepted' | 'rejected') {
    if (!userId || !event) return
    try {
      const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? ''
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WEB_URL}/api/event/respond-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ event_id: event.id, status }),
      })
      Alert.alert('', status === 'accepted' ? 'Aceptaste la invitación' : 'Rechazaste la invitación')
      // Reload event
      const { data: ev } = await (supabase as any)
        .from('events')
        .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher:profiles!teacher_id(id, username, full_name, avatar_url)), event_enrollments(id, user_id, status)')
        .eq('id', id).single()
      setEvent(ev)
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo responder la invitación')
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#c026d3" size="large" />
      </SafeAreaView>
    )
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center" edges={['top']}>
        <Text className="text-gray-500 dark:text-dark-text2">Evento no encontrado</Text>
      </SafeAreaView>
    )
  }

  const eventType = (event.event_type ?? 'otro') as EventType
  const isCreator = userId === event.creator_id
  const acceptedInvites = (event.event_invites ?? []).filter((i: any) => i.status === 'accepted')
  const enrolledCount = (event.event_enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
  const isFull = event.has_spots && event.max_spots != null && enrolledCount >= event.max_spots
  const isPast = new Date(event.event_date) < new Date(new Date().toDateString())
  const myInvite = userId ? (event.event_invites ?? []).find((i: any) => i.teacher?.id === userId || i.teacher_id === userId) : null
  const canEnroll = userId && !isCreator && !myEnrollment && !isFull && !isPast && event.status === 'active'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Text className="text-brand-600 dark:text-brand-400 font-medium">← Volver</Text>
        </TouchableOpacity>
        <Text className="flex-1 font-bold text-base text-gray-900 dark:text-dark-text" numberOfLines={1}>
          {EVENT_TYPE_LABELS[eventType]}
        </Text>
        {isCreator && (
          <TouchableOpacity onPress={() => router.push(`/(app)/event/${event.id}/edit` as any)}>
            <Text className="text-brand-600 dark:text-brand-400 text-sm font-medium">Editar</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Cover */}
        {event.cover_url ? (
          <Image source={{ uri: event.cover_url }} className="w-full" style={{ aspectRatio: 16 / 9 }} resizeMode="cover" />
        ) : (
          <View className="w-full items-center justify-center" style={{ aspectRatio: 16 / 9, backgroundColor: isDark ? '#241547' : '#EDE9FE' }}>
            <Text style={{ fontSize: 56 }}>{eventType === 'batalla' ? '🏆' : eventType === 'masterclass' ? '📚' : '⭐'}</Text>
          </View>
        )}

        <View className="p-4 space-y-4">
          {/* Type + title */}
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <View className="rounded-full px-2.5 py-0.5 bg-orange-100 dark:bg-orange-900/20">
                <Text className="text-orange-700 dark:text-orange-400 text-xs font-semibold">{EVENT_TYPE_LABELS[eventType]}</Text>
              </View>
              {event.status === 'cancelled' && (
                <View className="rounded-full px-2.5 py-0.5 bg-red-100 dark:bg-red-900/20">
                  <Text className="text-red-700 dark:text-red-400 text-xs font-semibold">Cancelado</Text>
                </View>
              )}
            </View>
            <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">{event.title}</Text>
            {event.description && (
              <Text className="text-sm text-gray-600 dark:text-dark-text2 mt-2 leading-relaxed">{event.description}</Text>
            )}
          </View>

          {/* Meta */}
          <View className="bg-white dark:bg-dark-surface rounded-xl p-4 space-y-2 border border-gray-100 dark:border-dark-border">
            <Text className="text-sm text-gray-700 dark:text-dark-text">
              📅 <Text className="font-medium">{formatEventDate(event.event_date)}</Text>
              {event.event_time ? ` · ${event.event_time}` : ''}
            </Text>
            {event.city && <Text className="text-sm text-gray-700 dark:text-dark-text">📍 {event.city}</Text>}
            {event.has_spots && (
              <Text className="text-sm text-gray-700 dark:text-dark-text">
                👥 {enrolledCount}/{event.max_spots} inscritos{isFull ? ' · Lleno' : ''}
              </Text>
            )}
            {event.has_entry ? (
              <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                🎫 Entrada: {formatCLP(event.entry_price ?? 0)}
              </Text>
            ) : (
              <Text className="text-sm text-gray-500 dark:text-dark-text2">Entrada libre</Text>
            )}
          </View>

          {/* Organizer */}
          <TouchableOpacity
            onPress={() => router.push(`/(app)/teacher/${event.creator?.username}` as any)}
            className="flex-row items-center gap-3 bg-white dark:bg-dark-surface rounded-xl p-4 border border-gray-100 dark:border-dark-border"
          >
            <Avatar url={event.creator?.avatar_url} name={event.creator?.full_name} size={40} />
            <View className="flex-1">
              <Text className="text-xs text-gray-500 dark:text-dark-text2">Organizador</Text>
              <Text className="font-semibold text-gray-900 dark:text-dark-text">{event.creator?.full_name}</Text>
              <Text className="text-xs text-gray-500 dark:text-dark-text2">@{event.creator?.username}</Text>
            </View>
          </TouchableOpacity>

          {/* Invited teachers */}
          {acceptedInvites.length > 0 && (
            <View>
              <Text className="text-sm font-semibold text-gray-700 dark:text-dark-text mb-2">Profesores invitados</Text>
              {acceptedInvites.map((invite: any) => (
                <TouchableOpacity
                  key={invite.id}
                  onPress={() => router.push(`/(app)/teacher/${invite.teacher?.username}` as any)}
                  className="flex-row items-center gap-3 bg-white dark:bg-dark-surface rounded-xl p-3 mb-2 border border-gray-100 dark:border-dark-border"
                >
                  <Avatar url={invite.teacher?.avatar_url} name={invite.teacher?.full_name} size={36} />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">{invite.teacher?.full_name}</Text>
                    <Text className="text-xs text-gray-500 dark:text-dark-text2">@{invite.teacher?.username}</Text>
                  </View>
                  <Text className="text-xs text-emerald-600 dark:text-emerald-400">✅ Confirmado</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* My invite (if I'm an invited teacher) */}
          {myInvite && myInvite.status === 'pending' && (
            <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <Text className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-3">
                Te invitaron a participar en este evento
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => handleRespondInvite('accepted')}
                  className="flex-1 bg-emerald-600 rounded-xl py-2 items-center"
                >
                  <Text className="text-white font-semibold text-sm">Aceptar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRespondInvite('rejected')}
                  className="flex-1 border border-gray-300 dark:border-dark-border rounded-xl py-2 items-center"
                >
                  <Text className="text-gray-700 dark:text-dark-text font-medium text-sm">Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Enroll CTA */}
          {canEnroll && (
            <TouchableOpacity
              onPress={handleEnroll}
              disabled={enrolling}
              className="bg-brand-600 rounded-xl py-4 items-center"
            >
              <Text className="text-white font-bold text-base">
                {enrolling ? 'Inscribiendo...' : event.has_entry ? `Inscribirse · ${formatCLP(event.entry_price ?? 0)}` : 'Inscribirse (entrada libre)'}
              </Text>
            </TouchableOpacity>
          )}

          {myEnrollment && myEnrollment.status !== 'cancelled' && (
            <View className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <Text className="text-emerald-700 dark:text-emerald-400 text-sm font-medium text-center">
                {myEnrollment.status === 'confirmed' ? '✅ Tu inscripción está confirmada' : '✅ Estás inscrito. Te esperamos!'}
              </Text>
            </View>
          )}

          <View className="h-8" />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
