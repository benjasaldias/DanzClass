'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen, ChevronRight, CheckCircle2, Clock, AlertCircle,
  Users, ChevronDown, ChevronUp, XCircle, Trash2,
  AlertTriangle, ShieldAlert, ClipboardList, History, Receipt, Share2, Bell,
  CalendarDays, MessageCircle, Download, Package, Plus,
} from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { sendNotifications } from '@/lib/notifications'
import CreatePackageModal from '@/components/class/CreatePackageModal'

// ─── Helpers ─────────────────────────────────────────────────────

function formatDeletionDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isDeleted(deletionDate: string | null): boolean {
  if (!deletionDate) return false
  return new Date(deletionDate) <= new Date()
}

// A class is "current" (vigente) if it hasn't ended yet, considering its last session + duration.
// Used to filter which classes are eligible for package creation.
function isClassCurrent(cls: any): boolean {
  const now = new Date()
  const durationMs = (cls.duration_minutes ?? 60) * 60 * 1000

  if (cls.type === 'suelta') {
    if (!cls.date) return true
    const [h = 0, m = 0] = (cls.time ?? '00:00').split(':').map(Number)
    const [y, mo, d] = cls.date.split('-').map(Number)
    const end = new Date(y, mo - 1, d, h, m)
    end.setTime(end.getTime() + durationMs)
    return end >= now
  }
  if (cls.recurrence === 'custom' || cls.custom_dates?.length) {
    const dates: string[] = cls.custom_dates ?? []
    if (!dates.length) return true
    const last = [...dates].sort().at(-1)!
    const [h = 0, m = 0] = (cls.recurring_time ?? cls.time ?? '00:00').split(':').map(Number)
    const [y, mo, d] = last.split('-').map(Number)
    const end = new Date(y, mo - 1, d, h, m)
    end.setTime(end.getTime() + durationMs)
    return end >= now
  }
  // periodic / entrenamiento: current if no ends_at, or ends_at+time hasn't passed
  if (cls.ends_indefinitely || !cls.ends_at) return true
  const [h = 0, m = 0] = (cls.recurring_time ?? '00:00').split(':').map(Number)
  const [y, mo, d] = cls.ends_at.split('-').map(Number)
  const end = new Date(y, mo - 1, d, h, m)
  end.setTime(end.getTime() + durationMs)
  return end >= now
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

        const classIsCancelled = cls?.status === 'cancelled'
        const canRequestRefund = classIsCancelled && enrollment.status === 'confirmed'

        return (
          <div key={enrollment.id} className="card p-4 flex gap-3 hover:shadow-md transition-shadow">
            <Avatar src={teacher?.avatar_url} name={teacher?.full_name ?? '?'} size="md" />
            <div className="flex-1 min-w-0">
              <Link href={`/class/${cls?.id}`} className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate block">
                {cls?.title}
                {classIsCancelled && (
                  <span className="ml-2 text-xs font-normal text-red-500 dark:text-red-400">(clase cancelada)</span>
                )}
              </Link>
              <p className="text-xs text-gray-500 dark:text-dark-text2">{teacher?.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">{schedule}</p>
              <div className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', config.color)}>
                <Icon className="h-3 w-3" />
                {config.label}
              </div>
              {enrollment.status === 'pending_payment' && !classIsCancelled && (
                <p className="mt-1 text-xs text-brand-600 font-medium">
                  {formatCLP(cls?.price)} — Haz clic para pagar
                </p>
              )}
              {canRequestRefund && (
                <Link
                  href={`/teacher/${teacher?.username}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle className="h-3 w-3" />
                  Solicitar reembolso al profesor
                </Link>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 dark:text-dark-border flex-shrink-0 self-center" />
          </div>
        )
      })}
    </div>
  )
}

// ─── Teaching tab ─────────────────────────────────────────────────────────────

const PAYMENT_STATUS = {
  pending_payment: { label: 'Sin pago', color: 'text-coral-fuego', dot: 'bg-coral-fuego/70' },
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
  const [classData, setClassData] = useState(initialClasses)
  const [removeConfirm, setRemoveConfirm] = useState<{ enrollmentId: string; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<string[]>(initialDismissed)
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null)
  const [showCreatePackage, setShowCreatePackage] = useState(false)
  const [pendingPackages, setPendingPackages] = useState<any[]>([])
  const [confirmingPkg, setConfirmingPkg] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPendingPackages() {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('package_enrollments')
        .select(`
          id, status, amount, created_at,
          student:profiles!student_id(id, full_name, username, avatar_url),
          package:class_packages!inner(id, title, price, teacher_id,
            items:class_package_items(class_id, class:classes(title))
          )
        `)
        .eq('package.teacher_id', currentUserId)
        .eq('status', 'payment_submitted')
      setPendingPackages(data ?? [])
    }
    fetchPendingPackages()
  }, [currentUserId])

  async function handlePackageAction(pkgId: string, pkgEnrollmentId: string, action: 'confirm' | 'reject') {
    setConfirmingPkg(pkgEnrollmentId)
    const res = await fetch(`/api/packages/${pkgId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_enrollment_id: pkgEnrollmentId, action }),
    })
    if (res.ok) {
      setPendingPackages((prev) => prev.filter((e) => e.id !== pkgEnrollmentId))
    }
    setConfirmingPkg(null)
  }

  function copyClassLink(classId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/class/${classId}`)
    setCopiedClassId(classId)
    setTimeout(() => setCopiedClassId(null), 2000)
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

  // Only show non-archived classes in TeachingTab (archived → historial)
  const activeClasses = classData.filter((cls: any) => !isDeleted(cls.deletion_date ?? null))

  const pendingPayments = activeClasses.reduce((acc: number, cls: any) =>
    acc + cls.enrollments.filter((e: any) => e.status === 'payment_submitted').length, 0)

  // Collect debtors from active (non-archived) past suelta classes only
  const today = new Date().toISOString().split('T')[0]
  const debtors = activeClasses.flatMap((cls: any) =>
    cls.enrollments
      .filter((e: any) =>
        e.status === 'pending_payment' &&
        !dismissedIds.includes(e.student?.id ?? e.student_id) &&
        (cls.type === 'suelta' && cls.date && cls.date < today)
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

      {showCreatePackage && (
        <CreatePackageModal
          classes={classData.filter((cls: any) => !isDeleted(cls.deletion_date ?? null) && isClassCurrent(cls))}
          onClose={() => setShowCreatePackage(false)}
          onCreated={() => setShowCreatePackage(false)}
        />
      )}

      {/* Pending package payments */}
      {pendingPackages.length > 0 && (
        <div className="mb-4 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-900/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">Pagos de paquetes por verificar</p>
          </div>
          <div className="space-y-2">
            {pendingPackages.map((pe: any) => (
              <div key={pe.id} className="rounded-xl bg-white dark:bg-dark-surface border border-violet-100 dark:border-dark-border p-3">
                <div className="flex items-start gap-3 mb-2">
                  <Avatar src={pe.student?.avatar_url} name={pe.student?.full_name ?? '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">{pe.student?.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text2">{pe.package?.title}</p>
                    <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">{formatCLP(pe.amount ?? pe.package?.price)}</p>
                    <div className="text-xs text-gray-400 dark:text-dark-text2 mt-0.5">
                      {(pe.package?.items ?? []).map((i: any) => i.class?.title).filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePackageAction(pe.package?.id, pe.id, 'confirm')}
                    disabled={confirmingPkg === pe.id}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar pago
                  </button>
                  <button
                    onClick={() => handlePackageAction(pe.package?.id, pe.id, 'reject')}
                    disabled={confirmingPkg === pe.id}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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

      {/* Create package CTA — only when ≥2 current classes exist */}
      {classData.filter((cls: any) => !isDeleted(cls.deletion_date ?? null) && isClassCurrent(cls)).length >= 2 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowCreatePackage(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-900/10 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-colors"
          >
            <Package className="h-3.5 w-3.5" />
            Crear paquete
          </button>
        </div>
      )}

      <div className="space-y-3">
        {activeClasses.map((cls) => {
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
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-200"
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

                  {/* Deletion warning: 24 h después de la última clase pasa al Historial */}
                  {deletionDate && !deleted && (
                    <p className="mt-1.5 text-xs text-coral-fuego flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Pasará al Historial el {formatDeletionDate(deletionDate)} (se eliminarán fotos y videos)
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

                                {(enrollment.status === 'payment_submitted' || payment?.confirmed_by === 'ai') && payment && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-xs text-gray-500 dark:text-dark-text2">Monto: {formatCLP(payment.amount)}</p>
                                    {payment.confirmed_by === 'ai' && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Confirmado por IA — revisar</p>
                                    )}
                                    <Link
                                      href={`/payment/review/${payment.id}`}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                                    >
                                      Revisar pago
                                    </Link>
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
  no_payment: 'bg-coral-fuego/10 border-coral-fuego/30 text-coral-fuego dark:bg-coral-fuego/5 dark:border-coral-fuego/20',
}

function paymentStatusLabel(enrollment: any): { key: keyof typeof PAYMENT_PILL; label: string } {
  const payment = Array.isArray(enrollment.payment) ? enrollment.payment[0] : enrollment.payment
  if (enrollment.status === 'confirmed') return { key: 'confirmed', label: 'Confirmado' }
  if (payment?.status === 'rejected') return { key: 'rejected', label: 'Rechazado' }
  if (enrollment.status === 'payment_submitted' || payment) return { key: 'pending', label: 'Pendiente' }
  return { key: 'no_payment', label: 'Sin pago' }
}

// Fix 4: Date without comma — DD/MM/YYYY avoids CSV column split in Excel
function formatDateForCSV(dateStr: string): string {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

function exportTeacherCSV(teacherRows: any[]) {
  const STATUS_LABELS: Record<string, string> = {
    confirmed: 'Confirmado', rejected: 'Rechazado', pending: 'Pendiente', no_payment: 'Sin pago',
  }
  const headers = ['Fecha', 'Alumno', 'Clase', 'Monto (CLP)', 'Estado']
  const rows = teacherRows.map((row: any) => {
    const statusKey = row.enrollmentStatus === 'confirmed' ? 'confirmed'
      : row.payment?.status === 'rejected' ? 'rejected'
      : row.enrollmentStatus === 'payment_submitted' || row.payment ? 'pending'
      : 'no_payment'
    return [
      formatDateForCSV(row.createdAt),
      row.student?.full_name ?? '—',
      row.classTitle,
      row.payment?.amount ? String(row.payment.amount) : '—',
      STATUS_LABELS[statusKey],
    ]
  })
  // Excel en locales con coma decimal (es-CL) usa `;` como separador de listas,
  // no `,`: con coma metía toda la fila en una sola celda. Usamos `;` + la línea
  // directiva `sep=;` (Excel la respeta sin importar el locale) + BOM + CRLF.
  const escape = (cell: unknown) => `"${String(cell).replace(/"/g, '""')}"`
  const body = [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n')
  const csv = 'sep=;\r\n' + body
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pagos-recibidos-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Two months back cutoff for history display
function getHistoryCutoff(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - 2)
  return d
}

function getStatusKey(enrollmentStatus: string, payment: any): keyof typeof PAYMENT_PILL {
  if (enrollmentStatus === 'confirmed') return 'confirmed'
  if (payment?.status === 'rejected') return 'rejected'
  if (enrollmentStatus === 'payment_submitted' || payment) return 'pending'
  return 'no_payment'
}

const STATUS_LABEL: Record<keyof typeof PAYMENT_PILL, string> = {
  confirmed: 'Confirmado', rejected: 'Rechazado', pending: 'Pendiente', no_payment: 'Sin pago',
}

// Badge "Asistencia confirmada" (item 2): visible cuando el alumno tiene al
// menos un check-in por QR registrado en `attendance` para esa clase.
function AttendanceBadge({ dates }: { dates: string[] | undefined }) {
  if (!dates || dates.length === 0) return null
  const label = dates.length > 1 ? `Asistió ×${dates.length}` : 'Asistió'
  const title = `Asistencia confirmada por QR: ${dates.map((d) => formatDate(d)).join(', ')}`
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
    >
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  )
}

function HistoryTab({ enrollments, teachingClasses, attendance = {} }: { enrollments: any[]; teachingClasses: any[]; attendance?: Record<string, string[]> }) {
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set())
  const [closedClasses, setClosedClasses] = useState<Set<string>>(new Set())
  const [confirmEnroll, setConfirmEnroll] = useState<{ id: string; name: string; studentId: string; classId: string } | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [localConfirmed, setLocalConfirmed] = useState<Set<string>>(new Set())

  const cutoff = getHistoryCutoff()

  // ── Build teacher rows (all enrollments within 2-month window) ────────────
  const teacherRows = teachingClasses.flatMap((cls: any) =>
    (cls.enrollments ?? [])
      .filter((e: any) => e.status !== 'cancelled' && new Date(e.created_at) >= cutoff)
      .map((e: any) => ({
        id: e.id,
        classId: cls.id,
        classTitle: cls.title,
        student: e.student,
        payment: Array.isArray(e.payment) ? e.payment[0] : e.payment,
        enrollmentStatus: localConfirmed.has(e.id) ? 'confirmed' : e.status,
        createdAt: e.created_at,
      }))
  )

  // ── Student rows within 2-month window ────────────────────────────────────
  const studentRows = enrollments.filter((e: any) => new Date(e.created_at) >= cutoff)

  const hasTeacher = teacherRows.length > 0
  const hasStudent = studentRows.length > 0

  // ── Group teacher rows: month → class ─────────────────────────────────────
  const monthClassMap = new Map<string, { display: string; classMap: Map<string, { title: string; rows: typeof teacherRows }> }>()
  for (const row of teacherRows) {
    const d = new Date(row.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const display = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    if (!monthClassMap.has(key)) monthClassMap.set(key, { display, classMap: new Map() })
    const mc = monthClassMap.get(key)!
    if (!mc.classMap.has(row.classId)) mc.classMap.set(row.classId, { title: row.classTitle, rows: [] })
    mc.classMap.get(row.classId)!.rows.push(row)
  }
  const sortedTeacherMonths = [...monthClassMap.entries()].sort(([a], [b]) => b.localeCompare(a))

  // ── Group student rows: month ─────────────────────────────────────────────
  const studentMonthMap = new Map<string, { display: string; rows: typeof studentRows }>()
  for (const e of studentRows) {
    const d = new Date(e.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const display = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    if (!studentMonthMap.has(key)) studentMonthMap.set(key, { display, rows: [] })
    studentMonthMap.get(key)!.rows.push(e)
  }
  const sortedStudentMonths = [...studentMonthMap.entries()].sort(([a], [b]) => b.localeCompare(a))

  // ── Monthly confirmed summary ─────────────────────────────────────────────
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

  function toggleMonth(key: string) {
    setClosedMonths(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleClass(key: string) {
    setClosedClasses(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function handleConfirmEnrollment() {
    if (!confirmEnroll) return
    setConfirmingId(confirmEnroll.id)
    const supabase = createClient()
    await supabase.from('enrollments').update({ status: 'confirmed' }).eq('id', confirmEnroll.id)
    await sendNotifications({
      user_id: confirmEnroll.studentId,
      type: 'payment_confirmed',
      data: { class_id: confirmEnroll.classId },
    })
    setLocalConfirmed(prev => new Set([...prev, confirmEnroll.id]))
    setConfirmEnroll(null)
    setConfirmingId(null)
  }

  if (!hasStudent && !hasTeacher) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
          <History className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin historial</h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">No hay pagos registrados en los últimos 2 meses.</p>
        <Link href="/explore" className="mt-4 btn-primary text-sm">Explorar clases</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {confirmEnroll && (
        <ConfirmDialog
          title="Confirmar pago"
          message={`¿Segur@ que quieres confirmar el pago de ${confirmEnroll.name}?`}
          confirmLabel="Sí, confirmar"
          loading={confirmingId !== null}
          onConfirm={handleConfirmEnrollment}
          onCancel={() => setConfirmEnroll(null)}
        />
      )}

      {/* ── Student section ────────────────────────────────────────── */}
      {hasStudent && (
        <div>
          {hasTeacher && <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text2 mb-3">Mis pagos</h3>}
          <div className="space-y-2">
            {sortedStudentMonths.map(([key, { display, rows }]) => {
              const monthOpen = !closedMonths.has(`s:${key}`)
              return (
                <div key={key} className="rounded-xl border border-gray-100 dark:border-dark-border overflow-hidden">
                  <button
                    onClick={() => toggleMonth(`s:${key}`)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-dark-surface hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-700 dark:text-dark-text capitalize">{display}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-dark-text2">{rows.length} clase{rows.length !== 1 ? 's' : ''}</span>
                      {monthOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                    </div>
                  </button>
                  {monthOpen && (
                    <div className="divide-y divide-gray-50 dark:divide-dark-border bg-white dark:bg-dark-surface">
                      {rows.map((e: any) => {
                        const cls = e.class as any
                        const payment = Array.isArray(e.payment) ? e.payment[0] : e.payment
                        const { key: pillKey, label } = paymentStatusLabel(e)
                        return (
                          <Link key={e.id} href={`/class/${cls?.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 dark:text-dark-text truncate">{cls?.title}</p>
                              <p className="text-[11px] text-gray-400 dark:text-dark-text2 mt-0.5">
                                {payment?.amount ? formatCLP(payment.amount) : 'Sin pago registrado'}
                              </p>
                            </div>
                            <AttendanceBadge dates={attendance[`${cls?.id}:${e.student_id}`]} />
                            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium flex-shrink-0', PAYMENT_PILL[pillKey])}>
                              {label}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Teacher section ────────────────────────────────────────── */}
      {hasTeacher && (
        <div>
          <div className="flex items-center justify-between mb-3">
            {hasStudent && <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text2">Pagos recibidos</h3>}
            <button
              onClick={() => exportTeacherCSV(teacherRows)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          </div>

          <div className="space-y-2">
            {sortedTeacherMonths.map(([monthKey, { display, classMap }]) => {
              const monthOpen = !closedMonths.has(`t:${monthKey}`)
              const totalRows = [...classMap.values()].reduce((s, c) => s + c.rows.length, 0)
              return (
                <div key={monthKey} className="rounded-xl border border-gray-100 dark:border-dark-border overflow-hidden">
                  {/* Month header */}
                  <button
                    onClick={() => toggleMonth(`t:${monthKey}`)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-dark-surface hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-700 dark:text-dark-text capitalize">{display}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-dark-text2">{totalRows} alumno{totalRows !== 1 ? 's' : ''}</span>
                      {monthOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                    </div>
                  </button>

                  {monthOpen && (
                    <div className="divide-y divide-gray-50 dark:divide-dark-border">
                      {[...classMap.entries()].map(([classId, { title, rows: classRows }]) => {
                        const classKey = `${monthKey}::${classId}`
                        const classOpen = !closedClasses.has(classKey)
                        return (
                          <div key={classId}>
                            {/* Class header */}
                            <button
                              onClick={() => toggleClass(classKey)}
                              className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-dark-surface2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors border-t border-gray-50 dark:border-dark-border"
                            >
                              <span className="text-xs font-semibold text-gray-600 dark:text-dark-text2 truncate text-left">{title}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                <span className="text-[11px] text-gray-400 dark:text-dark-text2">{classRows.length}</span>
                                {classOpen ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
                              </div>
                            </button>

                            {classOpen && (
                              <div className="divide-y divide-gray-50 dark:divide-dark-border">
                                {classRows.map((row) => {
                                  const sk = getStatusKey(row.enrollmentStatus, row.payment)
                                  return (
                                    <div key={row.id} className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-dark-surface">
                                      <Avatar src={row.student?.avatar_url} name={row.student?.full_name ?? '?'} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-900 dark:text-dark-text truncate">{row.student?.full_name}</p>
                                        <p className="text-[11px] text-gray-400 dark:text-dark-text2">
                                          @{row.student?.username}{row.payment?.amount ? ` · ${formatCLP(row.payment.amount)}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <AttendanceBadge dates={attendance[`${row.classId}:${row.student?.id}`]} />
                                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', PAYMENT_PILL[sk])}>
                                          {STATUS_LABEL[sk]}
                                        </span>
                                        {sk === 'no_payment' && (
                                          <button
                                            onClick={() => setConfirmEnroll({ id: row.id, name: row.student?.full_name ?? 'este alumno', studentId: row.student?.id ?? '', classId: row.classId })}
                                            className="rounded-lg border border-coral-fuego/40 bg-coral-fuego/5 px-2 py-0.5 text-[11px] font-semibold text-coral-fuego hover:bg-coral-fuego/10 transition-colors"
                                          >
                                            Confirmar
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
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
          Aún no organizaste ni te invitaron a ningún ensayo.
        </p>
        <Link href="/publish" className="mt-4 btn-primary text-sm">Crear ensayo</Link>
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
  attendance?: Record<string, string[]>
}

export default function MyClassesClient({
  enrollments,
  teachingClasses,
  defaultTab,
  currentUserId,
  dismissedStudentIds,
  ownRehearsals = [],
  rehearsalInvites = [],
  attendance = {},
}: MyClassesClientProps) {
  const [tab, setTab] = useState<'enrolled' | 'teaching' | 'history' | 'rehearsals'>(defaultTab)

  const rehearsalCount = ownRehearsals.length + rehearsalInvites.length

  // Clases archivadas (item 1) solo viven en el Historial: se excluyen de
  // "Clases que dicto" / "Clases que tomo". HistoryTab sí recibe todo.
  const isHistoryOnly = (status?: string) => status === 'archived' || status === 'completed'
  const teachingActive = teachingClasses.filter((c) => !isHistoryOnly(c?.status))
  const enrolledActive = enrollments.filter((e) => !isHistoryOnly(e?.class?.status))

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
            {enrolledActive.length > 0 && (
              <span className={cn('ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                tab === 'enrolled' ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'bg-gray-300 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
              )}>
                {enrolledActive.length}
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
            {(() => {
              const n = teachingActive.filter((cls) => !isDeleted(cls.deletion_date ?? null)).length
              return n > 0 ? (
                <span className={cn('ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                  tab === 'teaching' ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300' : 'bg-gray-300 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
                )}>
                  {n}
                </span>
              ) : null
            })()}
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

      {tab === 'enrolled' && <EnrolledTab enrollments={enrolledActive} onGoToHistory={() => setTab('history')} />}
      {tab === 'teaching' && (
        <TeachingTab
          initialClasses={teachingActive}
          currentUserId={currentUserId}
          dismissedStudentIds={dismissedStudentIds}
        />
      )}
      {tab === 'rehearsals' && (
        <RehearsalsTab ownRehearsals={ownRehearsals} rehearsalInvites={rehearsalInvites} />
      )}
      {tab === 'history' && (
        <HistoryTab enrollments={enrollments} teachingClasses={teachingClasses} attendance={attendance} />
      )}
    </div>
  )
}
