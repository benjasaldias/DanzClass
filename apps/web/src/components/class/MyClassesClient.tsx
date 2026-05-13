'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen, ChevronRight, CheckCircle2, Clock, AlertCircle,
  Users, ChevronDown, ChevronUp, ExternalLink, XCircle,
} from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'

// ─── Enrolled tab ────────────────────────────────────────────────────────────

const ENROLL_STATUS = {
  pending_payment: { label: 'Pendiente de pago', icon: AlertCircle, color: 'text-gray-500 bg-gray-50 border-gray-200' },
  payment_submitted: { label: 'Verificando pago', icon: Clock, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, color: 'text-green-700 bg-green-50 border-green-200' },
  cancelled: { label: 'Cancelado', icon: AlertCircle, color: 'text-red-600 bg-red-50 border-red-200' },
}

function EnrolledTab({ enrollments }: { enrollments: any[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
          <BookOpen className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="font-semibold text-gray-900">Sin clases inscritas</h3>
        <p className="text-sm text-gray-500 mt-1">Explora el feed para encontrar clases</p>
        <Link href="/feed" className="mt-4 btn-primary">Ver clases</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
              <p className="font-semibold text-sm text-gray-900 truncate">{cls?.title}</p>
              <p className="text-xs text-gray-500">{teacher?.full_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{schedule}</p>
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
            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 self-center" />
          </Link>
        )
      })}
    </div>
  )
}

// ─── Teaching tab ─────────────────────────────────────────────────────────────

const PAYMENT_STATUS = {
  pending_payment: { label: 'Sin pago', color: 'text-gray-500', dot: 'bg-gray-300' },
  payment_submitted: { label: 'Pago enviado', color: 'text-yellow-700', dot: 'bg-yellow-400' },
  confirmed: { label: 'Confirmado', color: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-600', dot: 'bg-red-400' },
}

function TeachingTab({ initialClasses }: { initialClasses: any[] }) {
  const [expandedClass, setExpandedClass] = useState<string | null>(initialClasses[0]?.id ?? null)
  const [loadingEnrollment, setLoadingEnrollment] = useState<string | null>(null)
  const [classData, setClassData] = useState(initialClasses)
  const [removeConfirm, setRemoveConfirm] = useState<{ enrollmentId: string; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)

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
            payment: e.payment.map((p: any) => p.id === paymentId ? { ...p, status: action } : p),
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

  const pendingPayments = classData.reduce((acc: number, cls: any) =>
    acc + cls.enrollments.filter((e: any) => e.status === 'payment_submitted').length, 0)

  if (classData.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
          <Users className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="font-semibold text-gray-900">Sin clases publicadas</h3>
        <p className="text-sm text-gray-500 mt-1">Publica tu primera clase</p>
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
        <p className="text-sm text-yellow-700 font-medium mb-3">
          {pendingPayments} pago{pendingPayments !== 1 ? 's' : ''} por verificar
        </p>
      )}

      <div className="space-y-3">
        {classData.map((cls) => {
          const isExpanded = expandedClass === cls.id
          const enrollments = cls.enrollments ?? []
          const confirmed = enrollments.filter((e: any) => e.status === 'confirmed').length
          const pending = enrollments.filter((e: any) => e.status === 'payment_submitted').length

          return (
            <div key={cls.id} className="card overflow-hidden">
              <button
                onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{cls.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {cls.type === 'suelta'
                      ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
                      : `${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-green-700 font-medium">{confirmed} confirmados</span>
                    {pending > 0 && (
                      <span className="text-xs font-medium text-yellow-700 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        {pending} por verificar
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {enrollments.filter((e: any) => e.status !== 'cancelled').length}/{cls.max_spots} cupos
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-gray-400">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100">
                  {enrollments.filter((e: any) => e.status !== 'cancelled').length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-6">Sin inscripciones aún</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
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
                                    <p className="text-sm font-semibold text-gray-900">{student?.full_name}</p>
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
                                <p className="text-xs text-gray-500">@{student?.username}</p>

                                {enrollment.status === 'payment_submitted' && payment && (
                                  <div className="mt-2 space-y-2">
                                    {payment.receipt_url && (
                                      <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
                                        Ver comprobante
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                    <p className="text-xs text-gray-500">Monto: {formatCLP(payment.amount)}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────

interface MyClassesClientProps {
  enrollments: any[]
  teachingClasses: any[]
  defaultTab: 'enrolled' | 'teaching'
}

export default function MyClassesClient({ enrollments, teachingClasses, defaultTab }: MyClassesClientProps) {
  const [tab, setTab] = useState<'enrolled' | 'teaching'>(defaultTab)

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Mis clases</h1>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('enrolled')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
            tab === 'enrolled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Clases que tomo
          {enrollments.length > 0 && (
            <span className={cn('ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
              tab === 'enrolled' ? 'bg-brand-100 text-brand-700' : 'bg-gray-300 text-gray-600'
            )}>
              {enrollments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('teaching')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
            tab === 'teaching' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Clases que dicto
          {teachingClasses.length > 0 && (
            <span className={cn('ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
              tab === 'teaching' ? 'bg-brand-100 text-brand-700' : 'bg-gray-300 text-gray-600'
            )}>
              {teachingClasses.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'enrolled'
        ? <EnrolledTab enrollments={enrollments} />
        : <TeachingTab initialClasses={teachingClasses} />
      }
    </div>
  )
}
