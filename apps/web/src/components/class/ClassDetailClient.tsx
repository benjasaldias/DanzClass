'use client'

import { useState, useRef } from 'react'
import type { ElementType } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Clock, Users, Calendar, ChevronLeft, ChevronRight, UserPlus, UserMinus,
  AlertCircle, CheckCircle2, Pencil, Trash2, Flag, Tag, ClipboardList,
  ChevronDown, ChevronUp, Share2, Bell, CalendarPlus, MessageCircle,
} from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { downloadICS } from '@/lib/ics'
import { DAYS_OF_WEEK, LEVEL_LABELS } from '@danceclass/shared'
import { createClient } from '@/lib/supabase/client'
import { sendNotifications } from '@/lib/notifications'
import Avatar from '@/components/ui/Avatar'
import StyleChip from '@/components/ui/StyleChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CustomDatesCalendar from '@/components/class/CustomDatesCalendar'
import ReportModal from '@/components/ui/ReportModal'
import DiscountModal from '@/components/class/DiscountModal'
import TwoxRequestButton from '@/components/class/TwoxRequestButton'
import AuditionModal from '@/components/class/AuditionModal'
import PackageSection from '@/components/class/PackageSection'
import LocationMap from '@/components/map/LocationMap'
import type { User } from '@supabase/supabase-js'
import type { Profile, SubscriptionTier } from '@danceclass/shared'
import { canEnroll } from '@danceclass/shared'

interface ClassDetailClientProps {
  classData: any
  currentUser: User | null
  currentProfile: Profile | null
  enrollment: any
  spots: any
  isFollowing: boolean
  myAudition?: any
  friendsTwoxRequests?: any[]
  isInWaitlist?: boolean
  userTier?: SubscriptionTier
  classPackages?: any[]
  myPackageEnrollments?: any[]
}

type FollowInsert = { follower_id: string; following_id: string }
type NotificationInsert = { user_id: string; type: 'follow' | 'class_cancelled'; data: Record<string, unknown> }

const LEVEL_COLORS = {
  principiante: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  intermedio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  avanzado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  todos: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

export default function ClassDetailClient({
  classData, currentUser, currentProfile, enrollment: initialEnrollment,
  spots: initialSpots, isFollowing: initialIsFollowing, myAudition,
  friendsTwoxRequests = [], isInWaitlist: initialIsInWaitlist = false,
  userTier = 'none', classPackages = [], myPackageEnrollments = [],
}: ClassDetailClientProps) {
  const router = useRouter()

  const userId = currentUser?.id ?? null

  const [enrollment, setEnrollment] = useState(initialEnrollment)
  const [spots, setSpots] = useState(initialSpots)
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [enrolling, setEnrolling] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const dragStartX = useRef<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDatesCalendar, setShowDatesCalendar] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showAudition, setShowAudition] = useState(false)
  const [auditionSubmitted, setAuditionSubmitted] = useState(!!myAudition)
  const [discountData, setDiscountData] = useState({
    discount_price: classData.discount_price ?? null,
    discount_price_monthly: classData.discount_price_monthly ?? null,
  })
  const [friendsTwox, setFriendsTwox] = useState(friendsTwoxRequests)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isInWaitlist, setIsInWaitlist] = useState(initialIsInWaitlist)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const teacher = classData.teacher
  const media = [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)

  const isTeacher = userId !== null && classData.teacher_id === userId
  const spotsAvailable = spots?.spots_available ?? classData.max_spots
  const isFull = spotsAvailable <= 0
  const isEntrenamiento = classData.type === 'entrenamiento'
  const isPeriodic = classData.type === 'periodica' || isEntrenamiento
  const auditionOpen = isEntrenamiento && classData.requires_audition && !classData.audition_closed

  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

  const scheduleText = classData.type === 'suelta'
    ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
    : classData.recurrence === 'custom'
      ? `${classData.custom_dates?.length ?? 0} clase${(classData.custom_dates?.length ?? 0) !== 1 ? 's' : ''} programada${(classData.custom_dates?.length ?? 0) !== 1 ? 's' : ''} · ${formatTime(classData.recurring_time)}`
      : `${recurrenceLabel[classData.recurrence] ?? ''} · ${DAYS_OF_WEEK[classData.day_of_week]} · ${formatTime(classData.recurring_time)}`

  const activePrice = isPeriodic
    ? (discountData.discount_price_monthly ?? classData.price)
    : (discountData.discount_price ?? classData.price)

  const originalPrice = classData.price
  const hasDiscount = activePrice < originalPrice

  async function handleShare() {
    const url = `${window.location.origin}/class/${classData.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for browsers that block clipboard
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleEnroll() {
    if (!currentUser || isFull) return
    setEnrolling(true)
    setEnrollError(null)
    const res = await fetch('/api/class/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: classData.id }),
    })
    if (res.ok) {
      const json = await res.json()
      setEnrollment(json.enrollment)
      setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available - 1, spots_taken: prev.spots_taken + 1 } : prev)
      router.push(`/payment/${json.enrollment.id}`)
    } else {
      const json = await res.json().catch(() => ({}))
      if (json.error === 'subscription_required') {
        router.push('/plans')
      } else if (json.error === 'no_spots') {
        setEnrollError('Esta clase se acaba de llenar. Intenta en otra fecha.')
        setSpots((prev: any) => prev ? { ...prev, spots_available: 0 } : prev)
      } else if (json.error !== 'already_enrolled') {
        setEnrollError('No se pudo completar la inscripción. Intenta de nuevo.')
      }
    }
    setEnrolling(false)
  }

  async function handleFollowToggle() {
    if (!currentUser) return
    setFollowLoading(true)
    const supabase = createClient()
    if (isFollowing) {
      await supabase.from('follows' as any).delete().eq('follower_id', currentUser.id).eq('following_id', classData.teacher_id)
    } else {
      const followPayload: FollowInsert = { follower_id: currentUser.id, following_id: classData.teacher_id }
      await supabase.from('follows' as any).insert(followPayload as any)
      await sendNotifications({ user_id: classData.teacher_id, type: 'follow', data: { from_user_id: currentUser.id } })
    }
    setIsFollowing(!isFollowing)
    setFollowLoading(false)
  }

  async function handleLeaveClass() {
    setLeaving(true)
    const res = await fetch('/api/class/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId: enrollment.id }),
    })
    if (res.ok) {
      setEnrollment(null)
      setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available + 1, spots_taken: prev.spots_taken - 1 } : prev)
    }
    setLeaving(false)
    setShowLeaveConfirm(false)
  }

  async function handleJoinWaitlist() {
    if (!currentUser) return
    setWaitlistLoading(true)
    const res = await fetch('/api/class/waitlist/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: classData.id }),
    })
    if (res.ok) setIsInWaitlist(true)
    setWaitlistLoading(false)
  }

  async function handleLeaveWaitlist() {
    if (!currentUser) return
    setWaitlistLoading(true)
    const res = await fetch('/api/class/waitlist/leave', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: classData.id }),
    })
    if (res.ok) setIsInWaitlist(false)
    setWaitlistLoading(false)
  }

  async function handleDeleteClass() {
    if (!currentUser) return
    setDeleting(true)
    const supabase = createClient()
    const { data: enrollments } = await supabase.from('enrollments' as any).select('student_id').eq('class_id', classData.id).in('status', ['confirmed', 'payment_submitted', 'pending_payment'])
    if (enrollments && enrollments.length > 0) {
      await sendNotifications(
        enrollments.map((e: any) => ({
          user_id: e.student_id,
          type: 'class_cancelled' as const,
          data: { class_id: classData.id, class_title: classData.title },
        }))
      )
    }
    // Soft-delete the class record and clean up chats (via API to allow admin client)
    await fetch('/api/class/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classData.id }),
    })
    // Immediately purge Storage media (cron keeps this as fallback)
    const { data: mediaRows } = await supabase.from('class_media' as any).select('url').eq('class_id', classData.id)
    if (mediaRows && mediaRows.length > 0) {
      const paths = (mediaRows as any[]).map((m: any) => {
        try {
          const url = new URL(m.url)
          // path after /object/public/class-media/
          const match = url.pathname.match(/\/object\/public\/class-media\/(.+)$/)
          return match?.[1] ?? null
        } catch { return null }
      }).filter(Boolean) as string[]
      if (paths.length > 0) {
        await supabase.storage.from('class-media').remove(paths)
      }
      await supabase.from('class_media' as any).delete().eq('class_id', classData.id)
    }
    setDeleting(false)
    router.push('/my-classes')
  }

  function handleDiscountSaved() {
    setShowDiscount(false)
    router.refresh()
  }

  async function handleJoin2x(requestId: string) {
    setMatchingId(requestId)
    setMatchError(null)
    const res = await fetch('/api/class-2x/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId }),
    })
    if (res.ok) {
      setFriendsTwox((prev) => prev.filter((r) => r.id !== requestId))
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      if (res.status === 404) {
        setMatchError('Este 2x ya fue tomado por otra persona.')
        setFriendsTwox((prev) => prev.filter((r) => r.id !== requestId))
      } else {
        setMatchError(json.error ?? 'Error al unirse al 2x. Intenta de nuevo.')
      }
    }
    setMatchingId(null)
  }

  const alreadyPaid = enrollment?.status === 'confirmed' || enrollment?.status === 'payment_submitted'
  const leaveMessage = alreadyPaid
    ? `IMPORTANTE: ya pagaste esta clase. ¿Seguro que quieres salirte?`
    : `¿Seguro que quieres salirte de "${classData.title}"? Tu cupo quedará libre.`

  // Training with audition: enrollment is auto-created on accept — never show "Reservar cupo"
  const canEnrollDirectly = !isEntrenamiento || !classData.requires_audition
  const canUserEnroll = canEnroll(userTier)

  const shareButtonClasses = "flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium transition-colors"
  const shareButtonActiveClasses = copied
    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400"
    : "text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surface"

  return (
    <div className="flex flex-col">
      {showDeleteConfirm && (
        <ConfirmDialog title="Eliminar clase" message={`¿Eliminar "${classData.title}"? Todos los inscritos serán notificados.`} confirmLabel="Eliminar clase" destructive loading={deleting} onConfirm={handleDeleteClass} onCancel={() => setShowDeleteConfirm(false)} />
      )}
      {showLeaveConfirm && (
        <ConfirmDialog title="Salir de la clase" message={leaveMessage} confirmLabel="Sí, salirme" destructive loading={leaving} onConfirm={handleLeaveClass} onCancel={() => setShowLeaveConfirm(false)} />
      )}
      {showDatesCalendar && (
        <CustomDatesCalendar dates={classData.custom_dates ?? []} onClose={() => setShowDatesCalendar(false)} />
      )}
      {showReport && currentUser && (
        <ReportModal contentType="class" contentId={classData.id} reporterId={currentUser.id} onClose={() => setShowReport(false)} />
      )}
      {showDiscount && (
        <DiscountModal
          classId={classData.id}
          classType={classData.type}
          currentPrice={classData.price}
          currentPriceSuelta={classData.price_suelta}
          currentDiscountPrice={discountData.discount_price}
          currentDiscountPriceMonthly={discountData.discount_price_monthly}
          onClose={() => setShowDiscount(false)}
          onSaved={handleDiscountSaved}
        />
      )}
      {showAudition && currentUser && (
        <AuditionModal
          classId={classData.id}
          userId={currentUser.id}
          teacherId={classData.teacher_id}
          existing={myAudition ?? null}
          onClose={() => setShowAudition(false)}
          onSubmitted={() => { setAuditionSubmitted(true); setShowAudition(false); router.refresh() }}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text">
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>

        {isTeacher ? (
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={handleShare} className={cn(shareButtonClasses, shareButtonActiveClasses)}>
              <Share2 className="h-3.5 w-3.5" />
              {copied ? '¡Enlace copiado!' : 'Compartir'}
            </button>
            {isEntrenamiento && !classData.audition_closed && (
              <Link
                href={`/class/${classData.id}/auditions`}
                className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Postulaciones
              </Link>
            )}
            <button
              onClick={() => setShowDiscount(true)}
              className="flex items-center gap-1.5 rounded-xl border border-coral-fuego/40 bg-coral-fuego/10 px-3 py-1.5 text-xs font-medium text-coral-fuego hover:bg-coral-fuego/20 transition-colors"
            >
              <Tag className="h-3.5 w-3.5" />
              Descuento
            </button>
            <Link href={`/class/${classData.id}/edit`} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors">
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Link>
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleShare} className={cn(shareButtonClasses, shareButtonActiveClasses)}>
              <Share2 className="h-3.5 w-3.5" />
              {copied ? '¡Enlace copiado!' : 'Compartir'}
            </button>
            {currentUser && (
              <button onClick={() => setShowReport(true)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-dark-text2 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors">
                <Flag className="h-3.5 w-3.5" />
                Reportar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active discount banner */}
      {hasDiscount && (
        <div className="mx-4 mt-2 rounded-xl bg-coral-fuego/10 border border-coral-fuego/30 px-3 py-2 flex items-center gap-2">
          <Tag className="h-4 w-4 text-coral-fuego flex-shrink-0" />
          <p className="text-xs text-coral-fuego font-medium">¡Descuento activo en esta clase!</p>
        </div>
      )}

      {/* Media carousel */}
      {media.length > 0 && (
        <>
          <div
            className="relative w-full bg-black mt-2 select-none"
            style={{ minHeight: '240px', cursor: media.length > 1 ? 'grab' : 'default' }}
            onPointerDown={(e) => { if (media.length > 1) dragStartX.current = e.clientX }}
            onPointerUp={(e) => {
              if (dragStartX.current === null || media.length <= 1) return
              const delta = e.clientX - dragStartX.current
              if (delta > 50) setCurrentMediaIndex((i) => Math.max(0, i - 1))
              else if (delta < -50) setCurrentMediaIndex((i) => Math.min(media.length - 1, i + 1))
              dragStartX.current = null
            }}
            onPointerLeave={() => { dragStartX.current = null }}
          >
            {media[currentMediaIndex].type === 'image' ? (
              <img
                src={media[currentMediaIndex].url}
                alt={classData.title}
                className="w-full h-auto max-h-[70vh] object-contain mx-auto block pointer-events-none"
              />
            ) : (
              <video
                src={media[currentMediaIndex].url}
                className="w-full h-auto max-h-[85vh] block"
                controls
                playsInline
              />
            )}
          </div>

          {/* Carousel nav — debajo de la imagen, arriba del contenido */}
          {media.length > 1 && (
            <div className="flex items-center justify-center gap-3 py-2 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
              <button
                onClick={() => setCurrentMediaIndex((i) => Math.max(0, i - 1))}
                disabled={currentMediaIndex === 0}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:text-dark-text2 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-25"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex gap-1.5 items-center">
                {media.map((_: any, index: number) => (
                  <button
                    key={index}
                    onClick={() => setCurrentMediaIndex(index)}
                    className={cn('h-1.5 rounded-full transition-all', index === currentMediaIndex ? 'w-4 bg-brand-600 dark:bg-brand-400' : 'w-1.5 bg-gray-300 dark:bg-dark-border hover:bg-gray-400 dark:hover:bg-dark-text2')}
                  />
                ))}
              </div>
              <button
                onClick={() => setCurrentMediaIndex((i) => Math.min(media.length - 1, i + 1))}
                disabled={currentMediaIndex === media.length - 1}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:text-dark-text2 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-25"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      <div className="px-4 py-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">{classData.title}</h1>
            {(classData.dance_style || isEntrenamiento) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {classData.dance_style && (
                  <StyleChip style={classData.dance_style} sub={classData.class_type} />
                )}
                {isEntrenamiento && (
                  <span className="inline-flex items-center rounded-full bg-lavanda-suave px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200">
                    Entrenamiento
                  </span>
                )}
              </div>
            )}
          </div>
          <span className={cn('badge', LEVEL_COLORS[classData.level as keyof typeof LEVEL_COLORS] ?? 'bg-gray-100 text-gray-600')}>
            {LEVEL_LABELS[classData.level as keyof typeof LEVEL_LABELS] ?? classData.level}
          </span>
        </div>

        <div className="card p-3 flex items-center justify-between gap-3">
          <Link href={`/teacher/${teacher.username}`} className="flex items-center gap-3 min-w-0">
            <Avatar src={teacher.avatar_url} name={teacher.full_name} size="md" />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{teacher.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-dark-text2">@{teacher.username}</p>
            </div>
          </Link>
          {!isTeacher && currentUser && (
            <button
              onClick={handleFollowToggle}
              disabled={followLoading}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors flex-shrink-0',
                isFollowing ? 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 hover:border-red-200 hover:text-red-600' : 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-300 hover:bg-brand-100'
              )}
            >
              {isFollowing ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
        </div>

        {/* End date badge for entrenamiento/periodica */}
        {isPeriodic && classData.ends_at && (
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-dark-surface border border-gray-100 dark:border-dark-border px-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
            <span className="text-xs text-gray-600 dark:text-dark-text2">Hasta: <strong>{formatDate(classData.ends_at)}</strong></span>
          </div>
        )}
        {isEntrenamiento && classData.ends_indefinitely && (
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-dark-surface border border-gray-100 dark:border-dark-border px-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
            <span className="text-xs text-gray-600 dark:text-dark-text2">Duración <strong>indefinida</strong></span>
          </div>
        )}
        {isEntrenamiento && classData.billing_day && (
          <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-dark-surface border border-gray-100 dark:border-dark-border px-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
            <span className="text-xs text-gray-600 dark:text-dark-text2">Cobro mensual el día <strong>{classData.billing_day}</strong> de cada mes</span>
          </div>
        )}

        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span className="text-gray-700 dark:text-dark-text2 flex-1">{scheduleText}</span>
            {classData.recurrence === 'custom' && (classData.custom_dates?.length ?? 0) > 0 && (
              <button onClick={() => setShowDatesCalendar(true)} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors flex-shrink-0">
                <Calendar className="h-3 w-3" /> Ver fechas
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span className="text-gray-700 dark:text-dark-text2">{classData.duration_minutes} minutos</span>
          </div>
          {(classData.location_name || classData.location_address) && (
            <LocationMap
              lat={(classData as any).latitude}
              lng={(classData as any).longitude}
              name={classData.location_name}
              address={classData.location_address}
            />
          )}
          <div className="flex items-center gap-3 text-sm">
            <Users className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span className={cn('font-medium', isFull ? 'text-red-600 dark:text-red-400' : spotsAvailable <= 3 ? 'text-coral-fuego' : 'text-gray-700 dark:text-dark-text2')}>
              {isFull ? 'Sin cupos disponibles' : `${spotsAvailable} cupo${spotsAvailable !== 1 ? 's' : ''} disponible${spotsAvailable !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {classData.description && (
          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text mb-2">Descripción</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed whitespace-pre-wrap">{classData.description}</p>
          </div>
        )}

        {/* Friends looking for 2x partner in this class */}
        {!isTeacher && currentUser && friendsTwox.length > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 overflow-hidden">
            <button
              onClick={() => setFriendsOpen((o) => !o)}
              className="flex items-center justify-between w-full px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 flex-shrink-0">
                  <Users className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-semibold text-brand-800">Amigos buscando 2x</span>
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 text-white text-[10px] font-bold px-1">
                  {friendsTwox.length}
                </span>
              </div>
              {friendsOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-brand-600 flex-shrink-0" />
                : <ChevronDown className="h-3.5 w-3.5 text-brand-600 flex-shrink-0" />}
            </button>
            {friendsOpen && (
              <div className="px-3 pb-3 space-y-2">
                {matchError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">{matchError}</p>
                )}
                {friendsTwox.map((entry: any) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-xl bg-white dark:bg-dark-surface border border-brand-100 dark:border-dark-border px-3 py-2">
                    <Avatar src={entry.user?.avatar_url} name={entry.user?.full_name ?? ''} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{entry.user?.full_name}</p>
                      <p className="text-xs text-gray-500 dark:text-dark-text2">@{entry.user?.username}</p>
                    </div>
                    <button
                      onClick={() => handleJoin2x(entry.id)}
                      disabled={matchingId === entry.id}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                    >
                      {matchingId === entry.id && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      )}
                      ¡Ir juntos!
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audition status for entrenamiento */}
        {isEntrenamiento && classData.requires_audition && !isTeacher && currentUser && (
          <div className={cn('rounded-xl border p-4', auditionSubmitted ? 'bg-blue-50 border-blue-200' : 'bg-brand-50 border-brand-200')}>
            {auditionSubmitted ? (
              <div>
                <p className="text-sm font-semibold text-blue-800">Postulación enviada</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {myAudition?.status === 'accepted'
                    ? '¡Fuiste aceptad@! Tu cupo está reservado — completa el pago para confirmarlo.'
                    : myAudition?.status === 'rejected'
                      ? 'Tu postulación no fue seleccionada en esta ocasión.'
                      : 'El profesor revisará tu postulación y te notificará.'}
                </p>
                {myAudition?.status === 'pending' && (
                  <button
                    onClick={() => setShowAudition(true)}
                    className="mt-2 text-xs text-blue-700 font-medium underline hover:text-blue-900"
                  >
                    Editar postulación
                  </button>
                )}
              </div>
            ) : classData.audition_closed ? (
              <p className="text-sm text-gray-600">Las postulaciones están cerradas.</p>
            ) : (
              <div>
                <p className="text-sm font-semibold text-brand-800">Este entrenamiento requiere postulación</p>
                <p className="text-xs text-brand-600 mt-0.5 mb-3">Completa el formulario para que el profesor evalúe tu perfil.</p>
                <button
                  onClick={() => setShowAudition(true)}
                  className="btn-primary text-sm py-2"
                >
                  Postularme
                </button>
              </div>
            )}
          </div>
        )}

        {currentUser && enrollment && enrollment.status !== 'cancelled' && (
          <EnrollmentBanner enrollment={enrollment} classId={classData.id} classData={classData} onLeave={() => setShowLeaveConfirm(true)} />
        )}

        {/* Paquetes disponibles para esta clase */}
        {(classPackages.length > 0 || isTeacher) && (
          <PackageSection
            classPackages={classPackages}
            myPackageEnrollments={myPackageEnrollments}
            currentUserId={userId}
            isTeacher={isTeacher}
            canEnrollUser={canUserEnroll}
          />
        )}
      </div>

      {/* Bottom CTA — for authenticated enrolled students or guests */}
      {!isTeacher && (!enrollment || enrollment.status === 'cancelled') && canEnrollDirectly && (
        <div className="sticky bottom-app-nav left-0 right-0 border-t border-gray-100 dark:border-dark-border bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md px-4 pt-3 pb-4">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-dark-text2">
                {isPeriodic ? 'Precio mensual' : 'Precio'}
              </p>
              {hasDiscount ? (
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-coral-fuego">{formatCLP(activePrice)}</p>
                  <p className="text-sm text-gray-400 line-through">{formatCLP(originalPrice)}</p>
                </div>
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{formatCLP(classData.price)}</p>
              )}
              {classData.price_suelta && (
                <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
                  Suelta:{' '}
                  {discountData.discount_price ? (
                    <>
                      <span className="font-semibold text-coral-fuego">{formatCLP(discountData.discount_price)}</span>
                      <span className="line-through text-gray-400 ml-1">{formatCLP(classData.price_suelta)}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-gray-700 dark:text-dark-text2">{formatCLP(classData.price_suelta)}</span>
                  )}
                </p>
              )}
            </div>

            {/* Waitlist flow when class is full */}
            {isFull && currentUser ? (
              <div className="flex flex-col items-end gap-1.5">
                {isInWaitlist ? (
                  <>
                    <p className="text-xs text-gray-500 dark:text-dark-text2 flex items-center gap-1">
                      <Bell className="h-3.5 w-3.5 text-brand-500" />
                      Estás en la lista de espera
                    </p>
                    <button
                      onClick={handleLeaveWaitlist}
                      disabled={waitlistLoading}
                      className="text-xs text-gray-400 hover:text-red-500 font-medium underline disabled:opacity-50"
                    >
                      Salir de la lista
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleJoinWaitlist}
                    disabled={waitlistLoading}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-dark-border bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors disabled:opacity-50"
                  >
                    {waitlistLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                    Avisarme si hay cupo
                  </button>
                )}
              </div>
            ) : isFull && !currentUser ? (
              <Link href="/auth/login" className="btn-primary px-5 py-3 text-sm font-semibold flex-shrink-0">
                Inicia sesión
              </Link>
            ) : !currentUser ? (
              <Link href="/auth/login" className="btn-primary px-5 py-3 text-sm font-semibold flex-shrink-0">
                Inicia sesión para reservar
              </Link>
            ) : (
              // Inscripción abierta a todos (marketplace): sin plan también reserva
              // y luego paga in-app por Mercado Pago con comisión en la pantalla de pago.
              <button
                onClick={handleEnroll}
                disabled={enrolling}
                className="btn-primary px-6 py-3 text-base font-bold flex-shrink-0 disabled:opacity-60"
              >
                {enrolling ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Reservando...
                  </span>
                ) : 'Reservar cupo'}
              </button>
            )}
          </div>

          {enrollError && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400 font-medium">{enrollError}</p>
          )}

          {/* 2x button — solo para usuarios con plan cuando hay cupos */}
          {currentUser && canUserEnroll && (classData.price_2x || classData.price_suelta_2x) && !isFull && (
            <TwoxRequestButton
              classId={classData.id}
              classTitle={classData.title}
              userId={currentUser.id}
              price2x={classData.price_2x ?? classData.price_suelta_2x}
              price2xLabel={classData.price_2x ? (isPeriodic ? 'mensual por ambos' : 'total por ambos') : 'suelta por ambos'}
            />
          )}
        </div>
      )}
    </div>
  )
}

function EnrollmentBanner({ enrollment, classId, classData, onLeave }: { enrollment: any; classId: string; classData: any; onLeave: () => void }) {
  const router = useRouter()
  const [openingChat, setOpeningChat] = useState(false)

  const statusConfig = {
    pending_payment: { icon: AlertCircle, color: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300', title: 'Reserva pendiente de pago', desc: 'Completa el pago para confirmar tu cupo', showPayButton: true },
    payment_submitted: { icon: Clock, color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300', title: 'Comprobante enviado', desc: 'El profesor está verificando tu pago', showPayButton: false },
    confirmed: { icon: CheckCircle2, color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300', title: '¡Cupo confirmado!', desc: 'Tu pago fue verificado. Estás inscrito/a.', showPayButton: false },
  }
  const config = statusConfig[enrollment.status as keyof typeof statusConfig]
  if (!config) return null
  const Icon = config.icon as ElementType

  async function openChat() {
    setOpeningChat(true)
    const res = await fetch('/api/chat/get-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'class', class_id: classId }),
    })
    if (res.ok) {
      const { chat_id } = await res.json()
      router.push(`/chat/${chat_id}`)
    }
    setOpeningChat(false)
  }

  return (
    <div className={cn('rounded-xl border p-4', config.color)}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-sm">{config.title}</p>
          <p className="text-xs mt-0.5 opacity-80">{config.desc}</p>
          {config.showPayButton && (
            <Link href={`/payment/${enrollment.id}`} className="mt-2 inline-flex btn-primary text-xs py-1.5">Ir a pagar</Link>
          )}
          {enrollment.status === 'confirmed' && classData && (
            <button
              onClick={() => downloadICS(classData)}
              className="mt-2 mr-3 inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Agregar a calendario
            </button>
          )}
          {/* Chat button — for enrolled students (any active status) */}
          <button
            onClick={openChat}
            disabled={openingChat}
            className="mt-2 mr-3 inline-flex items-center gap-1.5 text-xs font-medium opacity-80 hover:opacity-100 underline disabled:opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {openingChat ? 'Abriendo chat...' : 'Chat con el profesor'}
          </button>
          <button onClick={onLeave} className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium underline">Salir de la clase</button>
        </div>
      </div>
    </div>
  )
}
