import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Users, UserPlus, UserCheck, Music2, AlertCircle, CheckCircle2, XCircle, Flag, Tag, Bell, ClipboardList, CalendarClock, UserCheck2 } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days}d`
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

type NotifConfig = {
  icon: LucideIcon
  bgColor: string
  iconColor: string
  label: (data: Record<string, any>, profileMap: Record<string, any>) => string
  route: (data: Record<string, any>) => string
}

const NOTIF_CONFIG: Record<string, NotifConfig> = {
  follow: {
    icon: Users, bgColor: '#eff6ff', iconColor: '#3b82f6',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} empezó a seguirte` : 'Alguien empezó a seguirte',
    route: (data) => data.from_user_id ? '/(app)/teacher/PLACEHOLDER' : '/(app)/(tabs)/explore',
  },
  friend_request: {
    icon: UserPlus, bgColor: '#f5f3ff', iconColor: '#7c3aed',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} te envió una solicitud de amistad` : 'Recibiste una solicitud de amistad',
    route: () => '/(app)/(tabs)/explore',
  },
  friend_accepted: {
    icon: UserCheck, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} aceptó tu solicitud de amistad` : 'Alguien aceptó tu solicitud',
    route: () => '/(app)/(tabs)/explore',
  },
  new_class: {
    icon: Music2, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data) => `Nueva clase: "${data.class_title ?? 'Sin título'}"`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/explore',
  },
  class_updated: {
    icon: AlertCircle, bgColor: '#fefce8', iconColor: '#ca8a04',
    label: (data) => `La clase "${data.class_title ?? ''}" fue modificada`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  },
  class_cancelled: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => `La clase "${data.class_title ?? ''}" fue cancelada`,
    route: () => '/(app)/(tabs)/feed',
  },
  payment_confirmed: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: () => '¡Tu pago fue confirmado! Cupo reservado.',
    route: () => '/(app)/(tabs)/my-classes',
  },
  payment_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: () => 'Tu pago fue rechazado. Contacta al profesor.',
    route: () => '/(app)/(tabs)/my-classes',
  },
  '2x_request': {
    icon: Users, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: () => 'Alguien busca compañer@ para tu clase 2x',
    route: () => '/(app)/(tabs)/feed',
  },
  '2x_match': {
    icon: Users, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: () => '¡Encontraste compañer@ para ir 2x!',
    route: () => '/(app)/(tabs)/my-classes',
  },
  '2x_payment_turn': {
    icon: Users, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: () => 'Tu compañer@ te pasó el turno de pago para la clase 2x',
    route: () => '/(app)/(tabs)/my-classes',
  },
  debt_warning: {
    icon: AlertCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => `${data.student_name ?? 'Un alumno'} que te debe un pago se inscribió en tu clase`,
    route: () => '/(app)/(tabs)/my-classes',
  },
  new_report: {
    icon: Flag, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: (data) => {
      const type = data.content_type === 'post' ? 'video' : 'clase'
      const reporter = data.reporter_name ? `@${data.reporter_name}` : 'alguien'
      return `Nuevo reporte de ${reporter}: ${data.reason ?? ''} en ${type}`
    },
    route: () => '/(app)/(tabs)/feed',
  },
  class_discount: {
    icon: Tag, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: (data) => `Descuento en "${data.class_title ?? 'una clase'}"`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  },
  audition_accepted: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data) => `¡Felicidades! Fuiste aceptad@ en "${data.class_title ?? 'el entrenamiento'}"`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  },
  audition_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => `Tu postulación a "${data.class_title ?? 'el entrenamiento'}" no fue seleccionada`,
    route: () => '/(app)/(tabs)/explore',
  },
  new_audition: {
    icon: ClipboardList, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} se postuló a tu entrenamiento` : 'Recibiste una nueva postulación',
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/my-classes',
  },
  class_reminder: {
    icon: CalendarClock, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data) => `Mañana tienes ${data.class_title ?? 'una clase'}${data.session_time ? ` a las ${data.session_time}` : ''}`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/my-classes',
  },
  waitlist_available: {
    icon: UserCheck2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data) => `¡Se liberó un cupo en ${data.class_title ?? 'una clase'}! Tienes 24h para inscribirte.`,
    route: (data) => data.class_id ? `/(app)/class/${data.class_id}` : '/(app)/(tabs)/feed',
  },
  rehearsal_invite: {
    icon: CalendarClock, bgColor: '#f5f3ff', iconColor: '#7F77DD',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} te invitó a un ensayo: "${data.rehearsal_title ?? ''}"` : `Te invitaron a un ensayo: "${data.rehearsal_title ?? ''}"`,
    route: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  },
  rehearsal_accepted: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} confirmó asistencia al ensayo "${data.rehearsal_title ?? ''}"` : `Alguien confirmó asistencia al ensayo`,
    route: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  },
  rehearsal_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} rechazó la invitación al ensayo "${data.rehearsal_title ?? ''}"` : `Alguien rechazó la invitación al ensayo`,
    route: (data) => data.rehearsal_id ? `/(app)/rehearsal/${data.rehearsal_id}` : '/(app)/(tabs)/feed',
  },
}

export default function NotificationsScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [notifications, setNotifications] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const notifs = data ?? []
      setNotifications(notifs)

      // Mark all as read
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)

      // Fetch profiles referenced in notification data
      const userIds = [...new Set(notifs.map((n) => (n.data as any)?.from_user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds)
        const map: Record<string, any> = {}
        ;(profiles ?? []).forEach((p) => { map[p.id] = p })
        setProfileMap(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  function handlePress(notif: any) {
    const config = NOTIF_CONFIG[notif.type]
    if (!config) return
    let route = config.route(notif.data ?? {})
    // For follow/friend notifications, resolve to the actual user profile
    if (notif.type === 'follow' && notif.data?.from_user_id) {
      const p = profileMap[notif.data.from_user_id]
      if (p?.username) route = `/(app)/teacher/${p.username}`
    }
    if (notif.type === 'friend_request' && notif.data?.from_user_id) {
      const p = profileMap[notif.data.from_user_id]
      if (p?.username) route = `/(app)/teacher/${p.username}`
    }
    if (notif.type === 'friend_accepted' && notif.data?.from_user_id) {
      const p = profileMap[notif.data.from_user_id]
      if (p?.username) route = `/(app)/teacher/${p.username}`
    }
    router.push(route as any)
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Notificaciones</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item: any) => item.id}
          ListEmptyComponent={
            <View className="items-center py-16 gap-3">
              <Bell size={40} stroke="#d1d5db" />
              <Text className="text-gray-500 dark:text-dark-text2 text-sm">Sin notificaciones por ahora</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const config = NOTIF_CONFIG[item.type]
            if (!config) return null
            const Icon = config.icon
            const label = config.label(item.data ?? {}, profileMap)
            const data = item.data as Record<string, any>
            const fromProfile = data?.from_user_id ? profileMap[data.from_user_id] : null
            const fromInitials = fromProfile?.full_name
              ?.split(' ')
              ?.map((n: string) => n[0])
              ?.slice(0, 2)
              ?.join('')
              ?.toUpperCase() ?? ''

            return (
              <TouchableOpacity
                onPress={() => handlePress(item)}
                className={`flex-row items-start gap-3 px-4 py-4 border-b border-gray-100 dark:border-dark-border ${!item.read ? 'bg-brand-50/30 dark:bg-brand-950/30' : 'bg-white dark:bg-dark-surface'}`}
              >
                {/* Avatar or icon */}
                <View className="relative">
                  {fromProfile ? (
                    <>
                      {fromProfile.avatar_url ? (
                        <Image source={{ uri: fromProfile.avatar_url }} className="w-10 h-10 rounded-full" />
                      ) : (
                        <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
                          <Text className="text-brand-700 font-bold text-sm">{fromInitials}</Text>
                        </View>
                      )}
                      <View
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: config.bgColor }}
                      >
                        <Icon size={11} stroke={config.iconColor} />
                      </View>
                    </>
                  ) : (
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: config.bgColor }}>
                      <Icon size={20} stroke={config.iconColor} />
                    </View>
                  )}
                </View>

                {/* Content */}
                <View className="flex-1">
                  <Text className={`text-sm leading-snug ${!item.read ? 'font-semibold text-gray-900 dark:text-dark-text' : 'text-gray-700 dark:text-dark-text2'}`}>
                    {label}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-dark-text2/60 mt-1">{timeAgo(item.created_at)}</Text>
                </View>

                {/* Unread dot */}
                {!item.read && (
                  <View className="w-2 h-2 rounded-full bg-brand-600 mt-1.5" />
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
