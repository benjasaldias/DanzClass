'use client'

import { useState } from 'react'
import type { ElementType } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  MapPin,
  Clock,
  Users,
  Calendar,
  ChevronLeft,
  UserPlus,
  UserMinus,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@danceclass/shared'

interface ClassDetailClientProps {
  classData: any
  currentUser: User
  currentProfile: Profile | null
  enrollment: any
  spots: any
  isFollowing: boolean
}

type EnrollmentInsert = {
  student_id: string
  class_id: string
  session_id: string | null
  status: 'pending_payment'
}

type FollowInsert = {
  follower_id: string
  following_id: string
}

type NotificationInsert = {
  user_id: string
  type: 'follow' | 'class_cancelled'
  data: Record<string, unknown>
}

const LEVEL_COLORS = {
  principiante: 'bg-green-100 text-green-700',
  intermedio: 'bg-yellow-100 text-yellow-700',
  avanzado: 'bg-red-100 text-red-700',
  todos: 'bg-blue-100 text-blue-700',
}

export default function ClassDetailClient({
  classData,
  currentUser,
  currentProfile,
  enrollment: initialEnrollment,
  spots: initialSpots,
  isFollowing: initialIsFollowing,
}: ClassDetailClientProps) {
  const router = useRouter()

  const [enrollment, setEnrollment] = useState(initialEnrollment)
  const [spots, setSpots] = useState(initialSpots)
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [enrolling, setEnrolling] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const teacher = classData.teacher
  const media = [...(classData.media ?? [])].sort(
    (a: any, b: any) => a.order_index - b.order_index
  )

  const isTeacher = classData.teacher_id === currentUser.id
  const spotsAvailable = spots?.spots_available ?? classData.max_spots
  const isFull = spotsAvailable <= 0

  const recurrenceLabel: Record<string, string> = {
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
  }

  const scheduleText =
    classData.type === 'suelta'
      ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
      : classData.recurrence === 'custom'
        ? `${classData.custom_dates?.length ?? 0} clase${
            (classData.custom_dates?.length ?? 0) !== 1 ? 's' : ''
          } programada${
            (classData.custom_dates?.length ?? 0) !== 1 ? 's' : ''
          } · ${formatTime(classData.recurring_time)}`
        : `${recurrenceLabel[classData.recurrence] ?? ''} · ${
            DAYS_OF_WEEK[classData.day_of_week]
          } · ${formatTime(classData.recurring_time)}`

  async function handleEnroll() {
    if (isFull) return

    setEnrolling(true)

    const supabase = createClient()

    const enrollmentPayload: EnrollmentInsert = {
      student_id: currentUser.id,
      class_id: classData.id,
      session_id: null,
      status: 'pending_payment',
    }

    const { data, error } = await supabase
      .from('enrollments' as any)
      .insert(enrollmentPayload as any)
      .select('*, payment:payments(*)')
      .single()

    if (!error && data) {
      setEnrollment(data)

      setSpots((prev: any) =>
        prev
          ? {
              ...prev,
              spots_available: prev.spots_available - 1,
              spots_taken: prev.spots_taken + 1,
            }
          : prev
      )

      router.push(`/payment/${data.id}`)
    }

    setEnrolling(false)
  }

  async function handleFollowToggle() {
    setFollowLoading(true)

    const supabase = createClient()

    if (isFollowing) {
      await supabase
        .from('follows' as any)
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', classData.teacher_id)
    } else {
      const followPayload: FollowInsert = {
        follower_id: currentUser.id,
        following_id: classData.teacher_id,
      }

      const notificationPayload: NotificationInsert = {
        user_id: classData.teacher_id,
        type: 'follow',
        data: { from_user_id: currentUser.id },
      }

      await supabase.from('follows' as any).insert(followPayload as any)
      await supabase
        .from('notifications' as any)
        .insert(notificationPayload as any)
    }

    setIsFollowing(!isFollowing)
    setFollowLoading(false)
  }

  async function handleLeaveClass() {
    setLeaving(true)
    const supabase = createClient()
    await supabase
      .from('enrollments' as any)
      .update({ status: 'cancelled' } as any)
      .eq('id', enrollment.id)
    setEnrollment(null)
    setSpots((prev: any) =>
      prev ? { ...prev, spots_available: prev.spots_available + 1, spots_taken: prev.spots_taken - 1 } : prev
    )
    setLeaving(false)
    setShowLeaveConfirm(false)
  }

  async function handleDeleteClass() {
    setDeleting(true)

    const supabase = createClient()

    const { data: enrollments } = await supabase
      .from('enrollments' as any)
      .select('student_id')
      .eq('class_id', classData.id)
      .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])

    if (enrollments && enrollments.length > 0) {
      const notificationPayloads: NotificationInsert[] = enrollments.map(
        (enrollmentItem: any) => ({
          user_id: enrollmentItem.student_id,
          type: 'class_cancelled',
          data: {
            class_id: classData.id,
            class_title: classData.title,
          },
        })
      )

      await supabase
        .from('notifications' as any)
        .insert(notificationPayloads as any)
    }

    await supabase
      .from('classes' as any)
      .update({ status: 'cancelled' } as any)
      .eq('id', classData.id)

    setDeleting(false)
    router.push('/my-classes')
  }

  const alreadyPaid = enrollment?.status === 'confirmed' || enrollment?.status === 'payment_submitted'
  const leaveMessage = alreadyPaid
    ? `IMPORTANTE: ya pagaste esta clase. ¿Seguro que quieres salirte? Esta acción no es reversible.`
    : `¿Seguro que quieres salirte de "${classData.title}"? Tu cupo quedará libre.`

  return (
    <div className="flex flex-col">
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Eliminar clase"
          message={`¿Eliminar "${classData.title}"? Todos los inscritos serán notificados. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar clase"
          destructive
          loading={deleting}
          onConfirm={handleDeleteClass}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          title="Salir de la clase"
          message={leaveMessage}
          confirmLabel="Sí, salirme"
          destructive
          loading={leaving}
          onConfirm={handleLeaveClass}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>

        {isTeacher && (
          <div className="flex gap-2">
            <Link
              href={`/class/${classData.id}/edit`}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Link>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        )}
      </div>

      {media.length > 0 && (
        <div className="relative aspect-square bg-gray-100">
          {media[currentMediaIndex].type === 'image' ? (
            <Image
              src={media[currentMediaIndex].url}
              alt={classData.title}
              fill
              className="object-cover"
              sizes="512px"
            />
          ) : (
            <video
              src={media[currentMediaIndex].url}
              className="w-full h-full object-cover"
              controls
              playsInline
            />
          )}

          {media.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {media.map((_: any, index: number) => (
                <button
                  key={index}
                  onClick={() => setCurrentMediaIndex(index)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    index === currentMediaIndex
                      ? 'w-4 bg-white'
                      : 'w-1.5 bg-white/60'
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {classData.title}
            </h1>

            {classData.dance_style && (
              <span className="text-sm text-brand-600 font-medium">
                {classData.dance_style}
              </span>
            )}
          </div>

          <span
            className={cn(
              'badge',
              LEVEL_COLORS[classData.level as keyof typeof LEVEL_COLORS] ??
                'bg-gray-100 text-gray-600'
            )}
          >
            {classData.level}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/teacher/${teacher.username}`}
            className="flex items-center gap-3"
          >
            <Avatar
              src={teacher.avatar_url}
              name={teacher.full_name}
              size="md"
            />

            <div>
              <p className="font-semibold text-sm text-gray-900">
                {teacher.full_name}
              </p>
              <p className="text-xs text-gray-500">@{teacher.username}</p>
            </div>
          </Link>

          {!isTeacher && (
            <button
              onClick={handleFollowToggle}
              disabled={followLoading}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors',
                isFollowing
                  ? 'border-gray-200 text-gray-600 hover:border-red-200 hover:text-red-600'
                  : 'border-brand-500 text-brand-600 bg-brand-50 hover:bg-brand-100'
              )}
            >
              {isFollowing ? (
                <UserMinus className="h-3.5 w-3.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span className="text-gray-700">{scheduleText}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span className="text-gray-700">
              {classData.duration_minutes} minutos
            </span>
          </div>

          {classData.location_name && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-brand-500 flex-shrink-0" />

              <div>
                <p className="text-gray-700">{classData.location_name}</p>

                {classData.location_address && (
                  <p className="text-xs text-gray-500">
                    {classData.location_address}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <Users className="h-4 w-4 text-brand-500 flex-shrink-0" />

            <span
              className={cn(
                'font-medium',
                isFull
                  ? 'text-red-600'
                  : spotsAvailable <= 3
                    ? 'text-orange-600'
                    : 'text-gray-700'
              )}
            >
              {isFull
                ? 'Sin cupos disponibles'
                : `${spotsAvailable} cupo${
                    spotsAvailable !== 1 ? 's' : ''
                  } disponible${spotsAvailable !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {classData.description && (
          <div>
            <h3 className="font-semibold text-sm text-gray-900 mb-2">
              Descripción
            </h3>

            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {classData.description}
            </p>
          </div>
        )}

        {enrollment && enrollment.status !== 'cancelled' && (
          <EnrollmentBanner
            enrollment={enrollment}
            classId={classData.id}
            onLeave={() => setShowLeaveConfirm(true)}
          />
        )}
      </div>

      {!isTeacher && (!enrollment || enrollment.status === 'cancelled') && (
        <div className="sticky bottom-16 left-0 right-0 border-t border-gray-100 bg-white/90 backdrop-blur-md px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">
                {classData.type === 'periodica' ? 'Precio mensual' : 'Precio'}
              </p>

              <p className="text-2xl font-bold text-gray-900">
                {formatCLP(classData.price)}
              </p>

              {classData.price_suelta && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Clase suelta:{' '}
                  <span className="font-semibold text-gray-700">
                    {formatCLP(classData.price_suelta)}
                  </span>
                </p>
              )}
            </div>

            <button
              onClick={handleEnroll}
              disabled={enrolling || isFull}
              className={cn(
                'btn-primary px-6 py-3 text-base',
                isFull && 'opacity-50 cursor-not-allowed'
              )}
            >
              {enrolling ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Reservando...
                </span>
              ) : isFull ? (
                'Sin cupos'
              ) : (
                'Reservar cupo'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EnrollmentBanner({
  enrollment,
  classId,
  onLeave,
}: {
  enrollment: any
  classId: string
  onLeave: () => void
}) {
  const statusConfig = {
    pending_payment: {
      icon: AlertCircle,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      title: 'Reserva pendiente de pago',
      desc: 'Completa el pago para confirmar tu cupo',
      showPayButton: true,
    },
    payment_submitted: {
      icon: Clock,
      color: 'bg-blue-50 border-blue-200 text-blue-800',
      title: 'Comprobante enviado',
      desc: 'El profesor está verificando tu pago',
      showPayButton: false,
    },
    confirmed: {
      icon: CheckCircle2,
      color: 'bg-green-50 border-green-200 text-green-800',
      title: '¡Cupo confirmado!',
      desc: 'Tu pago fue verificado. Estás inscrito/a.',
      showPayButton: false,
    },
  }

  const config = statusConfig[enrollment.status as keyof typeof statusConfig]
  if (!config) return null

  const Icon = config.icon as ElementType

  return (
    <div className={cn('rounded-xl border p-4', config.color)}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />

        <div className="flex-1">
          <p className="font-semibold text-sm">{config.title}</p>
          <p className="text-xs mt-0.5 opacity-80">{config.desc}</p>

          {config.showPayButton && (
            <Link
              href={`/payment/${enrollment.id}`}
              className="mt-2 inline-flex btn-primary text-xs py-1.5"
            >
              Ir a pagar
            </Link>
          )}

          <button
            onClick={onLeave}
            className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium underline"
          >
            Salir de la clase
          </button>
        </div>
      </div>
    </div>
  )
}