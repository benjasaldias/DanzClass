import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Users, UserPlus, UserCheck, Music2, AlertCircle, CheckCircle2, XCircle, Flag, Tag, Bell, ClipboardList, CalendarClock, UserCheck2, Lock } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { formatBillingPeriod } from '@danceclass/shared'
import { resolveNotificationRoute } from '../../lib/notificationRoutes'

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
}

// La ruta de cada tipo vive en `lib/notificationRoutes.ts` — compartida con el
// tap sobre un push (audit3 P1-6) — así que este mapa ya no tiene su propio
// `route`, sólo lo que hace falta para pintar la fila en la lista.
const NOTIF_CONFIG: Record<string, NotifConfig> = {
  follow: {
    icon: Users, bgColor: '#eff6ff', iconColor: '#3b82f6',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} empezó a seguirte` : 'Alguien empezó a seguirte',
  },
  friend_request: {
    icon: UserPlus, bgColor: '#f5f3ff', iconColor: '#7c3aed',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} te envió una solicitud de amistad` : 'Recibiste una solicitud de amistad',
  },
  friend_accepted: {
    icon: UserCheck, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} aceptó tu solicitud de amistad` : 'Alguien aceptó tu solicitud',
  },
  new_class: {
    icon: Music2, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data) => `Nueva clase: "${data.class_title ?? 'Sin título'}"`,
  },
  class_updated: {
    icon: AlertCircle, bgColor: '#fefce8', iconColor: '#ca8a04',
    label: (data) => `La clase "${data.class_title ?? ''}" fue modificada`,
  },
  class_cancelled: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) =>
      data.reason === 'payment_timeout' || data.reason === '2x_payment_timeout'
        ? `Tu reserva en "${data.class_title ?? 'una clase'}" se canceló por falta de pago`
        : `La clase "${data.class_title ?? ''}" fue cancelada`,
  },
  // `data.event_id` → el pago es de una entrada a evento (ver la nota en el
  // NotificationsClient de web).
  payment_confirmed: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data) => data.event_id
      ? `Tu entrada para "${data.event_title ?? 'el evento'}" fue confirmada`
      : '¡Tu pago fue confirmado! Cupo reservado.',
  },
  payment_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => data.event_id
      ? `Tu comprobante para "${data.event_title ?? 'el evento'}" fue rechazado`
      : 'Tu pago fue rechazado. Contacta al profesor.',
  },
  '2x_request': {
    icon: Users, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: () => 'Alguien busca compañer@ para tu clase 2x',
  },
  '2x_match': {
    icon: Users, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: () => '¡Encontraste compañer@ para ir 2x!',
  },
  '2x_payment_turn': {
    icon: Users, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: () => 'Tu compañer@ te pasó el turno de pago para la clase 2x',
  },
  debt_warning: {
    icon: AlertCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => `${data.student_name ?? 'Un alumno'} que te debe un pago se inscribió en tu clase`,
  },
  new_report: {
    icon: Flag, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: (data) => {
      const type = data.content_type === 'post' ? 'video' : 'clase'
      const reporter = data.reporter_name ? `@${data.reporter_name}` : 'alguien'
      return `Nuevo reporte de ${reporter}: ${data.reason ?? ''} en ${type}`
    },
  },
  class_discount: {
    icon: Tag, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: (data) => `Descuento en "${data.class_title ?? 'una clase'}"`,
  },
  audition_accepted: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data) => `¡Felicidades! Fuiste aceptad@ en "${data.class_title ?? 'el entrenamiento'}"`,
  },
  audition_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data) => `Tu postulación a "${data.class_title ?? 'el entrenamiento'}" no fue seleccionada`,
  },
  new_audition: {
    icon: ClipboardList, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} se postuló a tu entrenamiento` : 'Recibiste una nueva postulación',
  },
  class_reminder: {
    icon: CalendarClock, bgColor: '#fdf4ff', iconColor: '#c026d3',
    label: (data) => `Mañana tienes ${data.class_title ?? 'una clase'}${data.session_time ? ` a las ${data.session_time}` : ''}`,
  },
  waitlist_available: {
    icon: UserCheck2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data) => `¡Se liberó un cupo en ${data.class_title ?? 'una clase'}! Tienes 24h para inscribirte.`,
  },
  rehearsal_invite: {
    icon: CalendarClock, bgColor: '#f5f3ff', iconColor: '#7F77DD',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} te invitó a un ensayo: "${data.rehearsal_title ?? ''}"` : `Te invitaron a un ensayo: "${data.rehearsal_title ?? ''}"`,
  },
  rehearsal_accepted: {
    icon: CheckCircle2, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} confirmó asistencia al ensayo "${data.rehearsal_title ?? ''}"` : `Alguien confirmó asistencia al ensayo`,
  },
  rehearsal_rejected: {
    icon: XCircle, bgColor: '#fef2f2', iconColor: '#dc2626',
    label: (data, pm) => pm[data.from_user_id] ? `@${pm[data.from_user_id].username} rechazó la invitación al ensayo "${data.rehearsal_title ?? ''}"` : `Alguien rechazó la invitación al ensayo`,
  },
  payment_reminder: {
    icon: AlertCircle, bgColor: '#fefce8', iconColor: '#ca8a04',
    // Tres usos: reserva sin comprobante (cron cleanup-classes), mensualidad de
    // un entrenamiento (cron monthly-charges, que sí manda `billing_period`) y
    // —con `role: 'teacher'`— el aviso al PROFESOR de un comprobante que lleva
    // días sin revisar (audit3 P0-1).
    label: (data) => {
      const title = data.class_title ?? 'una clase'
      if (data.role === 'teacher') {
        const days = Number(data.waiting_days ?? 0)
        const since = days > 0 ? ` hace ${days} ${days === 1 ? 'día' : 'días'}` : ''
        return `Tienes un comprobante de "${title}" esperando tu revisión${since}.`
      }
      if (!data.billing_period) {
        return `Tienes un pago pendiente para "${title}". Sube tu comprobante para confirmar tu cupo.`
      }
      const month = formatBillingPeriod(String(data.billing_period))
      return data.charge_stage === 'overdue'
        ? `Debes ${month} de "${title}". Mientras no te pongas al día, tu QR de acceso no funciona.`
        : `Nueva mensualidad de "${title}": ${month}.`
    },
  },
  event_invite: {
    icon: Users, bgColor: '#fff7ed', iconColor: '#ea580c',
    label: (data) => `Te invitaron a participar como profe en "${data.event_title ?? 'un evento'}"`,
  },
  event_invite_accepted: {
    icon: UserCheck, bgColor: '#f0fdf4', iconColor: '#16a34a',
    label: (data, pm) => pm[data.teacher_id] ? `@${pm[data.teacher_id].username} aceptó tu invitación al evento` : 'Un profesor aceptó tu invitación',
  },
  event_invite_rejected: {
    icon: XCircle, bgColor: '#f9fafb', iconColor: '#6b7280',
    label: (data, pm) => pm[data.teacher_id] ? `@${pm[data.teacher_id].username} declinó tu invitación al evento` : 'Un profesor declinó tu invitación',
  },
  posts_expiring: {
    icon: Lock, bgColor: '#fffbeb', iconColor: '#d97706',
    label: (data) => {
      const n = Number(data.count ?? 1)
      const days = Number(data.days_left ?? 0)
      const cuando = days === 1 ? 'mañana' : `en ${days} días`
      return n === 1
        ? `Tu video guardado en privado se elimina ${cuando}. Activa un plan para conservarlo.`
        : `${n} videos guardados en privado se eliminan ${cuando}. Activa un plan para conservarlos.`
    },
  },
  mp_connection_expiring: {
    icon: AlertCircle, bgColor: '#fff7ed', iconColor: '#D85A30',
    label: (data) => {
      if (data.expired) return 'Tu cuenta de Mercado Pago se desconectó. Reconéctala para volver a recibir pagos in-app.'
      const days = Number(data.days_left ?? 0)
      const cuando = days <= 1 ? 'mañana' : `en ${days} días`
      return `Tu conexión con Mercado Pago vence ${cuando}. Reconéctala para seguir recibiendo pagos in-app.`
    },
  },
  payment_refunded: {
    icon: AlertCircle, bgColor: '#fff7ed', iconColor: '#ea580c',
    label: (data) => {
      const evento = data.mp_status === 'charged_back' ? 'Se hizo un contracargo' : 'Se reembolsó'
      return data.role === 'teacher'
        ? `${evento} sobre un pago de una de tus clases. El alumno perdió el acceso hasta que vuelva a pagar.`
        : `${evento} tu pago. Tu inscripción quedó pendiente de pago.`
    },
  },
}

export default function NotificationsScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [notifications, setNotifications] = useState<any[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
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
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handlePress(notif: any) {
    if (!NOTIF_CONFIG[notif.type]) return
    // `profileMap` ya está cargado en esta pantalla (se usa para el label), así
    // que se evita el round-trip extra de `resolveNotificationRoute` para
    // follow/friend_* cuando el perfil ya está en memoria.
    const cached = profileMap[notif.data?.from_user_id]
    const route = cached?.username
      ? `/(app)/teacher/${cached.username}`
      : await resolveNotificationRoute(notif.type, notif.data ?? {}, supabase)
    if (route) router.push(route as any)
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor="#c026d3"
            />
          }
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
