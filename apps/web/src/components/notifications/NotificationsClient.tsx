'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Bell, Music2, AlertCircle,
  CheckCircle2, XCircle, Users, Flag, ClipboardList, CalendarClock, UserCheck2, Lock,
  GraduationCap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import { timeAgo } from '@/lib/utils'
import { formatBillingPeriod } from '@danceclass/shared'

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
    label: (data) =>
      data.reason === 'payment_timeout' || data.reason === '2x_payment_timeout'
        ? `Tu reserva en "${data.class_title ?? 'una clase'}" se canceló por falta de pago`
        : `La clase "${data.class_title ?? ''}" fue cancelada`,
    href: (data) => (data.class_id ? `/class/${data.class_id}` : '/feed'),
  },
  // Un pago de entrada a evento reusa estos dos tipos (no hay tipo propio y
  // agregar uno reescribe el CHECK entero de `notifications`): `data.event_id`
  // distingue el caso y manda al evento en vez de a "Mis clases", donde los
  // eventos no aparecen.
  payment_confirmed: {
    icon: CheckCircle2,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data) => data.event_id
      ? `Tu entrada para "${data.event_title ?? 'el evento'}" fue confirmada`
      : 'Tu pago fue confirmado. ¡Cupo reservado!',
    href: (data) => (data.event_id ? `/event/${data.event_id}` : '/my-classes'),
  },
  payment_rejected: {
    icon: XCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
    label: (data) => data.event_id
      ? `Tu comprobante para "${data.event_title ?? 'el evento'}" fue rechazado`
      : 'Tu pago fue rechazado. Contáctate con el profesor.',
    href: (data) => (data.event_id ? `/event/${data.event_id}` : '/my-classes'),
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
  payment_reminder: {
    icon: AlertCircle,
    color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400',
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
    href: (data) =>
      data.role === 'teacher'
        ? (data.payment_id ? `/payment/review/${data.payment_id}` : '/my-classes')
        : (data.enrollment_id ? `/payment/${data.enrollment_id}` : '/my-classes'),
  },
  event_invite: {
    icon: Users,
    color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
    label: (data) => `Te invitaron a participar como profe en "${data.event_title ?? 'un evento'}"`,
    href: (data) => data.event_id ? `/event/${data.event_id}` : '/feed',
  },
  event_invite_accepted: {
    icon: UserCheck,
    color: 'text-green-500 bg-green-50 dark:bg-green-950/30 dark:text-green-400',
    label: (data) => {
      const who = data.teacher_username ? `@${data.teacher_username}` : 'Un profesor'
      return `${who} aceptó tu invitación al evento`
    },
    href: (data) => data.event_id ? `/event/${data.event_id}` : '/feed',
  },
  event_invite_rejected: {
    icon: XCircle,
    color: 'text-gray-400 bg-gray-50 dark:bg-dark-surface2 dark:text-dark-text2',
    label: (data) => {
      const who = data.teacher_username ? `@${data.teacher_username}` : 'Un profesor'
      return `${who} declinó tu invitación al evento`
    },
    href: (data) => data.event_id ? `/event/${data.event_id}` : '/feed',
  },
  teach_request: {
    icon: GraduationCap,
    color: 'text-[#7F77DD] bg-[#EEEDFE] dark:bg-dark-surface2 dark:text-[#A79FF0]',
    label: (data) => {
      const who = data.from_username ? `@${data.from_username}` : 'Alguien'
      const que = data.post_title ? `«${data.post_title}»` : 'una de tus coreografías'
      return `${who} quiere que enseñes ${que}`
    },
    href: () => '/profile',
  },
  posts_expiring: {
    icon: Lock,
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
    label: (data) => {
      const n = Number(data.count ?? 1)
      const days = Number(data.days_left ?? 0)
      const cuando = days === 1 ? 'mañana' : `en ${days} días`
      return n === 1
        ? `Tu video guardado en privado se elimina ${cuando}. Activa un plan para conservarlo.`
        : `${n} videos guardados en privado se eliminan ${cuando}. Activa un plan para conservarlos.`
    },
    href: () => '/profile',
  },
  mp_connection_expiring: {
    icon: AlertCircle,
    color: 'text-coral-fuego bg-coral-fuego/10',
    label: (data) => {
      if (data.expired) return 'Tu cuenta de Mercado Pago se desconectó. Reconéctala para volver a recibir pagos in-app.'
      const days = Number(data.days_left ?? 0)
      const cuando = days <= 1 ? 'mañana' : `en ${days} días`
      return `Tu conexión con Mercado Pago vence ${cuando}. Reconéctala para seguir recibiendo pagos in-app.`
    },
    href: () => '/profile/payment-info',
  },
  payment_refunded: {
    icon: AlertCircle,
    color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
    label: (data, { classMap }) => {
      const title = data.class_id ? classMap[data.class_id]?.title : null
      const clase = title ? `"${title}"` : 'una clase'
      const evento = data.mp_status === 'charged_back' ? 'Se hizo un contracargo' : 'Se reembolsó'
      return data.role === 'teacher'
        ? `${evento} sobre un pago de ${clase}. El alumno perdió el acceso hasta que vuelva a pagar.`
        : `${evento} tu pago de ${clase}. Tu inscripción quedó pendiente de pago.`
    },
    href: (data) => data.class_id ? `/class/${data.class_id}` : '/my-classes',
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
        <p className="font-semibold text-sm text-gray-700 dark:text-dark-text">Sin notificaciones</p>
        <p className="text-sm text-gray-500 dark:text-dark-text2">Te avisaremos aquí cuando pase algo.</p>
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
