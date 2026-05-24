'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Bell, Music2, AlertCircle,
  CheckCircle2, XCircle, Users, Flag, ClipboardList, CalendarClock, UserCheck2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import { timeAgo } from '@/lib/utils'

interface Notification {
  id: string
  type: string
  data: Record<string, string>
  read: boolean
  created_at: string
}

type ProfileMap = Record<string, { id: string; username: string; full_name: string; avatar_url: string | null }>
type ClassMap = Record<string, { id: string; title: string }>
type NotifMaps = { profileMap: ProfileMap; classMap: ClassMap }

interface NotificationsClientProps {
  notifications: Notification[]
  profileMap: ProfileMap
  classMap: ClassMap
  userId: string
}

const NOTIF_CONFIG: Record<string, {
  icon: React.ElementType
  color: string
  label: (data: Record<string, string>, maps: NotifMaps) => string
  href: (data: Record<string, string>, maps: NotifMaps) => string
}> = {
  follow: {
    icon: Users,
    color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400',
    label: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `@${p.username} empezó a seguirte` : 'Alguien empezó a seguirte'
    },
    href: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `/teacher/${p.username}` : '/explore'
    },
  },
  friend_request: {
    icon: UserPlus,
    color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400',
    label: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `@${p.username} te envió una solicitud de amistad` : 'Recibiste una solicitud de amistad'
    },
    href: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `/teacher/${p.username}` : '/explore'
    },
  },
  friend_accepted: {
    icon: UserCheck,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `@${p.username} aceptó tu solicitud de amistad` : 'Alguien aceptó tu solicitud'
    },
    href: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `/teacher/${p.username}` : '/explore'
    },
  },
  new_class: {
    icon: Music2,
    color: 'text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-300',
    label: (data) => `Nueva clase publicada: "${data.class_title ?? 'Sin título'}"`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/explore',
  },
  class_updated: {
    icon: AlertCircle,
    color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400',
    label: (data) => `La clase "${data.class_title ?? ''}" fue modificada`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/feed',
  },
  class_cancelled: {
    icon: XCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
    label: (data) => `La clase "${data.class_title ?? ''}" fue cancelada`,
    href: () => '/feed',
  },
  payment_confirmed: {
    icon: CheckCircle2,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: () => 'Tu pago fue confirmado. ¡Cupo reservado!',
    href: () => '/my-classes',
  },
  payment_rejected: {
    icon: XCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
    label: () => 'Tu pago fue rechazado. Contáctate con el profesor.',
    href: () => '/my-classes',
  },
  '2x_request': {
    icon: Users,
    color: 'text-coral-fuego bg-coral-fuego/10 dark:bg-coral-fuego/20',
    label: () => 'Alguien busca compañer@ para tu clase 2x',
    href: () => '/feed',
  },
  '2x_match': {
    icon: Users,
    color: 'text-coral-fuego bg-coral-fuego/20',
    label: () => '¡Encontraste compañer@ para ir 2x!',
    href: () => '/feed',
  },
  debt_warning: {
    icon: AlertCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
    label: (data) => `⚠️ ${data.student_name ?? 'Un alumno'} que te debe un pago se inscribió en tu clase`,
    href: () => '/my-classes',
  },
  new_report: {
    icon: Flag,
    color: 'text-coral-fuego bg-coral-fuego/20',
    label: (data) => {
      const type = data.content_type === 'post' ? 'video' : 'clase'
      const reason = data.reason ?? ''
      const reporter = data.reporter_name ? `@${data.reporter_name}` : 'alguien'
      return `Nuevo reporte de ${reporter}: ${reason} en ${type}`
    },
    href: () => '/admin',
  },
  '2x_payment_turn': {
    icon: Users,
    color: 'text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-300',
    label: () => 'Tu compañer@ te pasó el turno de pago para la clase 2x',
    href: () => '/my-classes',
  },
  class_discount: {
    icon: Bell,
    color: 'text-coral-fuego bg-coral-fuego/20',
    label: (data) => `🏷️ Descuento en "${data.class_title ?? 'una clase'}"`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/feed',
  },
  audition_accepted: {
    icon: CheckCircle2,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data) => `¡Felicidades! Fuiste aceptad@ en "${data.class_title ?? 'el entrenamiento'}"`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/feed',
  },
  audition_rejected: {
    icon: XCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
    label: (data) => `Tu postulación a "${data.class_title ?? 'el entrenamiento'}" no fue seleccionada`,
    href: () => '/explore',
  },
  new_audition: {
    icon: ClipboardList,
    color: 'text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-300',
    label: (data, { profileMap }) => {
      const p = profileMap[data.from_user_id]
      return p ? `@${p.username} se postuló a tu entrenamiento` : 'Recibiste una nueva postulación'
    },
    href: (data) => data.class_id ? `/class/${data.class_id}/auditions` : '/my-classes',
  },
  class_reminder: {
    icon: CalendarClock,
    color: 'text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-300',
    label: (data) => `Mañana tienes ${data.class_title ?? 'una clase'}${data.session_time ? ` a las ${data.session_time}` : ''}`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/my-classes',
  },
  waitlist_available: {
    icon: UserCheck2,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data) => `¡Se liberó un cupo en ${data.class_title ?? 'una clase'}! Tienes 24h para inscribirte.`,
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/feed',
  },
  rehearsal_invite: {
    icon: Users,
    color: 'text-[#7F77DD] bg-[#EEEDFE] dark:bg-dark-surface2 dark:text-violet-300',
    label: (data) => {
      const who = data.from_username ? `@${data.from_username}` : 'Alguien'
      return `${who} te invitó al ensayo "${data.rehearsal_title ?? 'Ensayo'}"`
    },
    href: (data) => data.rehearsal_id ? `/rehearsal/${data.rehearsal_id}` : '/feed',
  },
  rehearsal_accepted: {
    icon: UserCheck,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data) => {
      const who = data.from_username ? `@${data.from_username}` : 'Alguien'
      return `${who} confirmó asistencia al ensayo "${data.rehearsal_title ?? 'tu ensayo'}"`
    },
    href: (data) => data.rehearsal_id ? `/rehearsal/${data.rehearsal_id}` : '/feed',
  },
  rehearsal_rejected: {
    icon: XCircle,
    color: 'text-gray-400 bg-gray-50 dark:bg-dark-surface2 dark:text-dark-text2',
    label: (data) => {
      const who = data.from_username ? `@${data.from_username}` : 'Alguien'
      return `${who} no podrá ir al ensayo "${data.rehearsal_title ?? 'tu ensayo'}"`
    },
    href: (data) => data.rehearsal_id ? `/rehearsal/${data.rehearsal_id}` : '/feed',
  },
}

export default function NotificationsClient({ notifications, profileMap, classMap, userId }: NotificationsClientProps) {
  const supabase = createClient()

  // Mark all as read when page mounts
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read)
    if (unread.length > 0) {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
        .then(() => {})
    }
  }, [])

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <Bell className="h-12 w-12 text-gray-200 dark:text-dark-border" />
        <p className="text-sm text-gray-500 dark:text-dark-text2">Sin notificaciones por ahora</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-dark-border">
      {notifications.map((notif) => {
        const config = NOTIF_CONFIG[notif.type]
        if (!config) return null

        const Icon = config.icon
        const label = config.label(notif.data, { profileMap, classMap })
        const href = config.href(notif.data, { profileMap, classMap })
        const fromProfile = notif.data.from_user_id ? profileMap[notif.data.from_user_id] : null

        return (
          <Link
            key={notif.id}
            href={href}
            className={`flex items-start gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors ${!notif.read ? 'bg-brand-50/40 dark:bg-brand-950/20' : ''}`}
          >
            {/* Avatar or icon */}
            <div className="flex-shrink-0 mt-0.5">
              {fromProfile ? (
                <div className="relative">
                  <Avatar src={fromProfile.avatar_url} name={fromProfile.full_name} size="md" />
                  <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${config.color}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                </div>
              ) : (
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${!notif.read ? 'font-medium text-gray-900 dark:text-dark-text' : 'text-gray-700 dark:text-dark-text2'}`}>
                {label}
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-1">{timeAgo(notif.created_at)}</p>
            </div>

            {/* Unread dot */}
            {!notif.read && (
              <div className="flex-shrink-0 mt-2 h-2 w-2 rounded-full bg-brand-500" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
