'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen, ChevronRight, CheckCircle2, Clock, AlertCircle,
  Users, ChevronDown, ChevronUp, ExternalLink, XCircle, Trash2,
  AlertTriangle, ShieldAlert, ClipboardList, History, Receipt, Share2, Bell,
  CalendarDays,
} from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'

// ─── Helpers ─────────────────────────────────────────────────────

function formatDeletionDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isDeleted(deletionDate: string | null): boolean {
  if (!deletionDate) return false
  return new Date(deletionDate) <= new Date()
}

// ─── Enrolled tab ────────────────────────────────────────────────────────────

const ENROLL_STATUS = {
  pending_payment: { label: 'Pendiente de pago', icon: AlertCircle, color: 'text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400' },
  payment_submitted: { label: 'Verificando pago', icon: Clock, color: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, color: 'text-green-700 bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' },
  cancelled: { label: 'Cancelado', icon: AlertCircle, color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400' },
}

function EnrolledTab({ enrollments, onGoToHistory }: { enrollments: any[]; onGoToHistory: () => void }) {
  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
          <BookOpen className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin clases inscritas</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">Explora clases disponibles y apúntate</p>
        <Link href="/explore" className="mt-4 btn-primary">Explorar clases</Link>
      </div>
    )
  }

  const pendingCount = enrollments.filter(
    (e) => e.status === 'pending_payment' || e.status === 'payment_submitted'
  ).length

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Tienes {pendingCount} pago{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}.{' '}
            <button onClick={onGoToHistory} className="underline font-medium">Ver en Historial</button>
            ; debes resolverlo con tu profesor/a.
          </p>
        </div>
      )}
      {enrollments.map((enrollment) => {
        const cls = enrollment.class as any
        const teacher = cls?.teacher
        const config = ENROLL_STATUS[enrollment.status as keyof typeof ENROLL_STATUS]
        if (!config) return null
        const Icon = config.icon
        const schedule = cls?.type === 'suelta'
          ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
          : `${DAYS_OF_WEEK[cls?.day_of_week]} · ${formatTime(cls?.recurring_time)}`

        return (
          <Link key={enrollment.id} href={`/class/${cls?.id}`} className="card p-4 flex gap-3 hover:shadow-md transition-shadow">
            <Avatar src={teacher?.avatar_url} name={teacher?.full_name ?? '?'} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{cls?.title}</p>
              <p className="text-xs text-gray-500 dark:text-dark-text2">{teacher?.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">{schedule}</p>
              <div className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', config.color)}>
                <Icon className="h-3 w-3" />
                {config.label}
              </div>
              {enrollment.status === 'pending_payment' && (
                <p className="mt-1 text-xs text-brand-600 font-medium">
                  {formatCLP(cls?.price)} — Haz clic para pagar
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 dark:text-dark-border flex-shrink-0 self-center" />
          </Link>
        )
      })}
    </div>
  )
}

// ─── Teaching tab ─────────────────────────────────────────────────────────────

const PAYMENT_STATUS = {
  pending_payment: { label: 'Sin pago', color: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-300 dark:bg-gray-600' },
  payment_submitted: { label: 'Pago enviado', color: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-400' },
  confirmed: { label: 'Confirmado', color: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-400' },
}

function TeachingTab({
  initialClasses,
  currentUserId,
  dismissedStudentIds: initialDismissed,
}: {
  initialClasses: any[]
  currentUserId: string
  dismissedStudentIds: string[]
}) {
  const [expandedClass, setExpandedClass] = useState<string | null>(initialClasses[0]?.id ?? null)
  const [loadingEnrollment, setLoadingEnrollment] = useState<string | null>(null)
  const [classData, setClassData] = useState(initialClasses)
  const [removeConfirm, setRemoveConfirm] = useState<{ enrollmentId: string; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<string[]>(initialDismissed)
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null)

  function copyClassLink(classId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/class/${classId}`)
    setCopiedClassId(classId)
    setTimeout(() => setCopiedClassId(null), 2000)
  }

  async function handlePaymentAction(enrollmentId: string, paymentId: string, action: 'verified' | 'rejected') {
    setLoadingEnrollment(enrollmentId)
    const supabase = createClient()

    await supabase.from('payments').update({
      status: action,
      verified_at: action === 'verified' ? new Date().toISOString() : null,
    }).eq('id', paymentId)

    const newEnrollmentStatus = action === 'verified' ? 'confirmed' : 'pending_payment'
    await supabase.from('enrollments').update({ status: newEnrollmentStatus }).eq('id', enrollmentId)

    const notifType = action === 'verified' ? 'payment_confirmed' : 'payment_rejected'
    const enrollment = classData.flatMap((c: any) => c.enrollments).find((e: any) => e.id === enrollmentId)
    if (enrollment) {
      await supabase.from('notifications' as any).insert({
        user_id: enrollment.student?.id ?? enrollment.student_id,
        type: notifType,
        data: { class_id: classData.find((c: any) => c.enrollments.some((e: any) => e.id === enrollmentId))?.id },
      } as any)
    }

    setClassData((prev) =>
      prev.map((cls) => ({
        ...cls,
        enrollments: cls.enrollments.map((e: any) => {
          if (e.id !== enrollmentId) return e
          return {
            ...e,
            status: newEnrollmentStatus,
            payment: Array.isArray(e.payment)
              ? e.payment.map((p: any) => p.id === paymentId ? { ...p, status: action } : p)
              : e.payment,
          }
        }),
      }))
    )
    setLoadingEnrollment(null)
  }

  async function handleRemoveStudent() {
    if (!removeConfirm) return
    setRemoving(true)
    const supabase = createClient()
    await supabase.from('enrollments').update({ status: 'cancelled' }).eq('id', removeConfirm.enrollmentId)
    setClassData((prev) =>
      prev.map((cls) => ({
        ...cls,
        enrollments: cls.enrollments.map((e: any) =>
          e.id === removeConfirm.enrollmentId ? { ...e, status: 'cancelled' } : e
        ),
      }))
    )
    setRemoving(false)
    setRemoveConfirm(null)
  }

  async function handleDebtConfirmed(studentId: string) {
    const supabase = createClient()
    await supabase.from('dismissed_debts' as any).upsert(
      { teacher_id: currentUserId, student_id: studentId } as any,
      { onConflict: 'teacher_id,student_id', ignoreDuplicates: true }
    )
    setDismissedIds((prev) => [...prev, studentId])
  }

  const pendingPayments = classData.reduce((acc: number, cls: any) =>
    acc + cls.enrollments.filter((e: any) => e.status === 'payment_submitted').length, 0)

  // Collect all debtors across ALL classes (pending_payment from past/active classes, not dismissed)
  const today = new Date().toISOString().split('T')[0]
  const debtors = classData.flatMap((cls: any) =>
    cls.enrollments
      .filter((e: any) =>
        e.status === 'pending_payment' &&
        !dismissedIds.includes(e.student?.id ?? e.student_id) &&
        (cls.type === 'suelta' && cls.date && cls.date < today) // Only for past suelta classes
      )
      .map((e: any) => ({
        enrollmentId: e.id,
        student: e.student,
        classTitle: cls.title,
        classId: cls.id,
        studentId: e.student?.id ?? e.student_id,
      }))
  )

  if (classData.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
          <Users className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin clases publicadas</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">Publica tu primera clase</p>
        <Link href="/create-class" className="mt-4 btn-primary">Publicar clase</Link>
      </div>
    )
  }

  return (
    <>
      {removeConfirm && (
        <ConfirmDialog
          title="Eliminar alumno"
          message={`¿Eliminar a ${removeConfirm.name} de la clase? El cupo quedará disponible nuevamente.`}
          confirmLabel="Eliminar alumno"
          destructive
          loading={removing}
          onConfirm={handleRemoveStudent}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}

      {pendingPayments > 0 && (
        <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium mb-3">
          {pendingPayments} pago{pendingPayments !== 1 ? 's' : ''} por verificar
        </p>
      )}

      {/* Debtors section */}
      {debtors.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <p className="text-sm font-semibold text-red-700">Pagos pendientes de clases pasadas</p>
          </div>
          <p className="text-xs text-red-600 mb-3">
            Resuelve estos pagos directamente con el alumno. Una vez confirmado, el alumno saldrá de esta lista.
          </p>
          <div className="space-y-2">
            {debtors.map((d: any) => (
              <div key={d.enrollmentId} className="flex items-center gap-3 rounded-lg bg-white dark:bg-dark-surface border border-red-100 dark:border-red-900/40 p-3">
                <Avatar src={d.student?.avatar_url} name={d.student?.full_name ?? '?'} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{d.student?.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2 truncate">@{d.student?.username} · {d.classTitle}</p>
                </div>
                <button
                  onClick={() => handleDebtConfirmed(d.studentId)}
                  className="flex-shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Pago confirmado
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {classData.map((cls) => {
          const isExpanded = expandedClass === cls.id
          const enrollments = cls.enrollments ?? []
          const confirmed = enrollments.filter((e: any) => e.status === 'confirmed').length
          const pending = enrollments.filter((e: any) => e.status === 'payment_submitted').length
          const deletionDate = cls.deletion_date
          const deleted = isDeleted(deletionDate)

          const pendingAuditions = cls.requires_audition
            ? (cls.auditions ?? []).filter((a: any) => a.status === 'pending').length
            : 0

          return (
            <div key={cls.id} className="card overflow-hidden">
              <div
                onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/class/${cls.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate hover:text-brand-600 dark:hover:text-brand-300 transition-colors"
                  >
                    {cls.title}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
                    {cls.type === 'suelta'
                      ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
                      : `${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-green-700 dark:text-green-400 font-medium">{confirmed} confirmados</span>
                    {pending > 0 && (
                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        {pending} por verificar
                      </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-dark-text2">
                      {enrollments.filter((e: any) => e.status !== 'cancelled').length}/{cls.max_spots} cupos
                    </span>
                  </div>
                  {cls.requires_audition && (
                    <Link
                      href={`/class/${cls.id}/auditions`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      <ClipboardList className="h-3 w-3" />
                      Ver postulaciones
                      {pendingAuditions > 0 && (
                        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                          {pendingAuditions}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Waitlist count badge */}
                  {(() => {
                    const waitlistCount = Array.isArray(cls.waitlist)
                      ? (cls.waitlist[0]?.count ?? 0)
                      : 0
                    return waitlistCount > 0 ? (
                      <p className="mt-1.5 text-xs text-gris-humo dark:text-dark-text2 flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        {waitlistCount} en lista de espera
                      </p>
                    ) : null
                  })()}

                  {/* Deletion warning */}
                  {deletionDate && !deleted && (
                    <p className="mt-1.5 text-xs text-coral-fuego flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Archivos eliminados el {formatDeletionDate(deletionDate)}
                    </p>
                  )}
                  {deleted && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-dark-text2 flex items-center gap-1">
                      <Trash2 className="h-3 w-3" />
                      Archivos eliminados
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyClassLink(cls.id) }}
                    title={copiedClassId === cls.id ? '¡Copiado!' : 'Compartir enlace'}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
                  >
                    <Share2 className={cn('h-3.5 w-3.5', copiedClassId === cls.id ? 'text-green-500' : 'text-gray-400 dark:text-dark-text2')} />
                  </button>
                  <div className="text-gray-400 dark:text-dark-text2">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-dark-border">
                  {/* Post-deletion pending list */}
                  {deleted && (
                    <div className="p-4 bg-coral-fuego/10 border-b border-coral-fuego/20">
                      <p className="text-xs text-coral-fuego font-medium flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Los archivos de esta clase ya fueron eliminados. Usuarios con pago pendiente:
                      </p>
                      {enrollments
                        .filter((e: any) => e.status === 'pending_payment' && !dismissedIds.includes(e.student?.id ?? e.student_id))
                        .length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-dark-text2">Sin pagos pendientes.</p>
                      ) : (
                        <div className="space-y-2">
                          {enrollments
                            .filter((e: any) => e.status === 'pending_payment' && !dismissedIds.includes(e.student?.id ?? e.student_id))
                            .map((e: any) => (
                              <div key={e.id} className="flex items-center gap-2">
                                <Avatar src={e.student?.avatar_url} name={e.student?.full_name ?? '?'} size="sm" />
                                <span className="text-xs text-gray-700 dark:text-dark-text2 flex-1">{e.student?.full_name}</span>
                                <button
                                  onClick={() => handleDebtConfirmed(e.student?.id ?? e.student_id)}
                                  className="text-xs rounded-lg bg-green-600 text-white px-2.5 py-1 hover:bg-green-700 transition-colors"
                                >
                                  Pago confirmado
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {enrollments.filter((e: any) => e.status !== 'cancelled').length === 0 ? (
                    <p className="text-center text-sm text-gray-400 dark:text-dark-text2 py-6">Sin inscripciones aún</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-dark-border">
                      {enrollments
                        .filter((e: any) => e.status !== 'cancelled')
                        .map((enrollment: any) => {
                          const student = enrollment.student
                          const payment = enrollment.payment?.[0] ?? enrollment.payment
                          const config = PAYMENT_STATUS[enrollment.status as keyof typeof PAYMENT_STATUS]
                          const isLoading = loadingEnrollment === enrollment.id

                          return (
                            <div key={enrollment.id} className="p-4 flex items-start gap-3">
                              <Avatar src={student?.avatar_url} name={student?.full_name ?? '?'} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">{student?.full_name}</p>
                                    <span className={cn('flex items-center gap-1 text-xs font-medium', config?.color)}>
                                      <span className={cn('h-1.5 w-1.5 rounded-full', config?.dot)} />
                                      {config?.label}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => setRemoveConfirm({ enrollmentId: enrollment.id, name: student?.full_name ?? 'este alumno' })}
                                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 flex-shrink-0"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Eliminar
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-dark-text2">@{student?.username}</p>

                                {enrollment.status === 'payment_submitted' && payment && (
                                  <div className="mt-2 space-y-2">
                                    {payment.receipt_url && (
                                      <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
                                        Ver comprobante
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                    <p className="text-xs text-gray-500 dark:text-dark-text2">Monto: {formatCLP(payment.amount)}</p>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handlePaymentAction(enrollment.id, payment.id, 'verified')}
                                        disabled={isLoading}
                                        className={cn(
                                          'flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors',
                                          isLoading && 'opacity-50'
                                        )}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => handlePaymentAction(enrollment.id, payment.id, 'rejected')}
                                        disabled={isLoading}
                                        className={cn(
                                          'flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors',
                                          isLoading && 'opacity-50'
                                        )}
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                        Rechazar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── History tab ─────────────────────────────────────────────────────────────

const PAYMENT_PILL = {
  confirmed: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400',
  rejected: 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400',
  pending: 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-400',
  no_payment: 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400',
}

function paymentStatusLabel(enrollment: any): { key: keyof typeof PAYMENT_PILL; label: string } {
  const payment = Array.isArray(enrollment.payment) ? enrollment.payment[0] : enrollment.payment
  if (enrollment.status === 'confirmed') return { key: 'confirmed', label: 'Confirmado' }
  if (payment?.status === 'rejected') return { key: 'rejected', label: 'Rechazado' }
  if (enrollment.status === 'payment_submitted' || payment) return { key: 'pending', label: 'Pendiente' }
  return { key: 'no_payment', label: 'Sin pago' }
}

function HistoryTab({ enrollments, teachingClasses }: { enrollments: any[]; teachingClasses: any[] }) {
  const teacherRows = teachingClasses.flatMap((cls: any) =>
    (cls.enrollments ?? [])
      .filter((e: any) => e.status !== 'cancelled')
      .map((e: any) => ({
        id: e.id,
        classId: cls.id,
        classTitle: cls.title,
        classDanceStyle: cls.dance_style,
        student: e.student,
        payment: Array.isArray(e.payment) ? e.payment[0] : e.payment,
        enrollmentStatus: e.status,
        createdAt: e.created_at,
      }))
  )

  const hasStudent = enrollments.length > 0
  const hasTeacher = teacherRows.length > 0

  // Monthly summary for teacher view
  const monthlyMap: Record<string, { total: number; count: number }> = {}
  for (const row of teacherRows) {
    if (row.enrollmentStatus !== 'confirmed') continue
    const amount = row.payment?.amount ?? 0
    const month = new Date(row.createdAt).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    if (!monthlyMap[month]) monthlyMap[month] = { total: 0, count: 0 }
    monthlyMap[month].total += amount
    monthlyMap[month].count++
  }
  const monthlySummary = Object.entries(monthlyMap)

  if (!hasStudent && !hasTeacher) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
          <History className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin historial</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">Aquí verás tus pagos al inscribirte en clases</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Student history */}
      {hasStudent && (
        <div>
          {hasTeacher && (
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text2 mb-3">Mis pagos</h3>
          )}
          <div className="space-y-2">
            {enrollments.map((e: any) => {
              const cls = e.class as any
              const payment = Array.isArray(e.payment) ? e.payment[0] : e.payment
              const { key, label } = paymentStatusLabel(e)
              return (
                <Link key={e.id} href={`/class/${cls?.id}`} className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{cls?.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {cls?.dance_style && (
                        <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-950/30 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
                          {cls.dance_style}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-dark-text2">{formatDate(e.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-dark-text mt-1">
                      {payment?.amount ? formatCLP(payment.amount) : 'Sin pago registrado'}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium flex-shrink-0', PAYMENT_PILL[key])}>
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Teacher history */}
      {hasTeacher && (
        <div>
          {hasStudent && (
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text2 mb-3">Pagos recibidos</h3>
          )}
          <div className="space-y-2">
            {teacherRows.map((row: any) => {
              const statusKey = row.enrollmentStatus === 'confirmed' ? 'confirmed'
                : row.payment?.status === 'rejected' ? 'rejected'
                : row.enrollmentStatus === 'payment_submitted' || row.payment ? 'pending'
                : 'no_payment'
              const label = { confirmed: 'Confirmado', rejected: 'Rechazado', pending: 'Pendiente', no_payment: 'Sin pago' }[statusKey]
              return (
                <div key={row.id} className="card p-4 flex items-center gap-3">
                  <Avatar src={row.student?.avatar_url} name={row.student?.full_name ?? '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{row.student?.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text2 truncate">{row.classTitle}</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-dark-text mt-0.5">
                      {row.payment?.amount ? formatCLP(row.payment.amount) : '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', PAYMENT_PILL[statusKey as keyof typeof PAYMENT_PILL])}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-dark-text2">{formatDate(row.createdAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Monthly summary */}
          {monthlySummary.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
                <h4 className="text-sm font-semibold text-gray-700 dark:text-dark-text2">Resumen mensual</h4>
              </div>
              <div className="space-y-2">
                {monthlySummary.map(([month, { total, count }]) => (
                  <div key={month} className="card px-4 py-3 flex items-center justify-between">
                    <p className="text-sm text-gray-700 dark:text-dark-text capitalize">{month}</p>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">{formatCLP(total)}</p>
                      <p className="text-xs text-gray-400 dark:text-dark-text2">{count} pago{count !== 1 ? 's' : ''} confirmado{count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Rehearsals tab ──────────────────────────────────────────────────────────

const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatRehearsalDateShort(r: any): string {
  if (r.date_mode === 'single' && r.rehearsal_date) {
    const [, m, d] = r.rehearsal_date.split('-').map(Number)
    return `${d} ${MONTHS_ES_SHORT[m - 1]}`
  }
  if (r.date_mode === 'custom' && r.custom_dates?.length) {
    const sorted = [...r.custom_dates].sort()
    if (sorted.length === 1) {
      const [, m, d] = sorted[0].split('-').map(Number)
      return `${d} ${MONTHS_ES_SHORT[m - 1]}`
    }
    return `${sorted.length} fechas`
  }
  if (r.date_mode === 'coordinate' && r.coordinate_month) {
    const [, m] = r.coordinate_month.split('-').map(Number)
    return `Coord. ${MONTHS_ES_SHORT[m - 1]}`
  }
  return 'Por coordinar'
}

function RehearsalCard({ rehearsal, inviteStatus }: { rehearsal: any; inviteStatus?: string }) {
  const dateLabel = formatRehearsalDateShort(rehearsal)
  const invites: any[] = rehearsal.invites ?? []
  const accepted = invites.filter((i: any) => i.status === 'accepted').length
  const pending = invites.filter((i: any) => i.status === 'pending').length

  const isOwn = inviteStatus === undefined
  const isPending = inviteStatus === 'pending'

  return (
    <Link
      href={`/rehearsal/${rehearsal.id}`}
      className="card p-4 flex gap-3 hover:shadow-md transition-shadow"
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-10 h-10 rounded-xl bg-[#EEEDFE] dark:bg-dark-surface2 flex items-center justify-center">
          <CalendarDays className="h-5 w-5 text-[#7F77DD]" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 text-[#534AB7] dark:text-violet-300">
            Ensayo
          </span>
          {isPending && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400">
              Pendiente
            </span>
          )}
          {inviteStatus === 'accepted' && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
              Confirmado
            </span>
          )}
        </div>
        <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{rehearsal.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-gris-humo dark:text-dark-text2 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {dateLabel}
            {rehearsal.rehearsal_time && ` · ${rehearsal.rehearsal_time.slice(0, 5)}`}
          </span>
          {isOwn && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {accepted} confirmado{accepted !== 1 ? 's' : ''}
              {pending > 0 && `, ${pending} pendiente${pending !== 1 ? 's' : ''}`}
            </span>
          )}
          {!isOwn && rehearsal.creator && (
            <span>de @{rehearsal.creator.username}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400 dark:text-dark-text2 flex-shrink-0 self-center" />
    </Link>
  )
}

function RehearsalsTab({ ownRehearsals, rehearsalInvites }: { ownRehearsals: any[]; rehearsalInvites: any[] }) {
  const hasOwn = ownRehearsals.length > 0
  const hasInvites = rehearsalInvites.length > 0

  if (!hasOwn && !hasInvites) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
          <CalendarDays className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin ensayos</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">
          Crea un ensayo desde "Publicar" o espera una invitación
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {hasOwn && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-3">
            Ensayos que organizo
          </h2>
          <div className="space-y-2">
            {ownRehearsals.map((r: any) => (
              <RehearsalCard key={r.id} rehearsal={r} />
            ))}
          </div>
        </section>
      )}

      {hasInvites && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-3">
            Invitaciones
          </h2>
          <div className="space-y-2">
            {rehearsalInvites.map((invite: any) => {
              const rehearsal = invite.rehearsal
              if (!rehearsal) return null
              return (
                <RehearsalCard
                  key={invite.id}
                  rehearsal={rehearsal}
                  inviteStatus={invite.status}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MyClassesClientProps {
  enrollments: any[]
  teachingClasses: any[]
  defaultTab: 'enrolled' | 'teaching'
  currentUserId: string
  dismissedStudentIds: string[]
  ownRehearsals?: any[]
  rehearsalInvites?: any[]
}

export default function MyClassesClient({
  enrollments,
  teachingClasses,
  defaultTab,
  currentUserId,
  dismissedStudentIds,
  ownRehearsals = [],
  rehearsalInvites = [],
}: MyClassesClientProps) {
  const [tab, setTab] = useState<'enrolled' | 'teaching' | 'history' | 'rehearsals'>(defaultTab)

  const rehearsalCount = ownRehearsals.length + rehearsalInvites.length

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-4">Mis clases</h1>

      {/* Tab toggle — two rows to avoid overflow with 4 tabs */}
      <div className="flex flex-col gap-1 mb-5">
        <div className="flex gap-1 bg-gray-100 dark:bg-dark-surface rounded-xl p-1">
          <button
            onClick={() => setTab('enrolled')}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              tab === 'enrolled' ? 'bg-white dark:bg-dark-surface2 text-gray-900 dark:text-dark-text shadow-sm' : 'text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text'
            )}
          >
            Clases que tomo
            {enrollments.length > 0 && (
              <span className={cn('ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                tab === 'enrolled' ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'bg-gray-300 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
              )}>
                {enrollments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('teaching')}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              tab === 'teaching' ? 'bg-white dark:bg-dark-surface2 text-gray-900 dark:text-dark-text shadow-sm' : 'text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text'
            )}
          >
            Clases que dicto
            {teachingClasses.length > 0 && (
              <span className={cn('ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                tab === 'teaching' ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'bg-gray-300 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
              )}>
                {teachingClasses.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-dark-surface rounded-xl p-1">
          <button
            onClick={() => setTab('rehearsals')}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              tab === 'rehearsals' ? 'bg-white dark:bg-dark-surface2 text-gray-900 dark:text-dark-text shadow-sm' : 'text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text'
            )}
          >
            Ensayos
            {rehearsalCount > 0 && (
              <span className={cn('ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                tab === 'rehearsals' ? 'bg-[#EEEDFE] dark:bg-dark-surface text-[#534AB7] dark:text-violet-300' : 'bg-gray-300 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
              )}>
                {rehearsalCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('history')}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              tab === 'history' ? 'bg-white dark:bg-dark-surface2 text-gray-900 dark:text-dark-text shadow-sm' : 'text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text'
            )}
          >
            Historial
          </button>
        </div>
      </div>

      {tab === 'enrolled' && <EnrolledTab enrollments={enrollments} onGoToHistory={() => setTab('history')} />}
      {tab === 'teaching' && (
        <TeachingTab
          initialClasses={teachingClasses}
          currentUserId={currentUserId}
          dismissedStudentIds={dismissedStudentIds}
        />
      )}
      {tab === 'rehearsals' && (
        <RehearsalsTab ownRehearsals={ownRehearsals} rehearsalInvites={rehearsalInvites} />
      )}
      {tab === 'history' && (
        <HistoryTab enrollments={enrollments} teachingClasses={teachingClasses} />
      )}
    </div>
  )
}
