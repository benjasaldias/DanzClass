'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, XCircle, Clock, Users, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'

const STATUS_CONFIG = {
  pending_payment: { label: 'Sin pago', color: 'text-gray-500', dot: 'bg-gray-300' },
  payment_submitted: { label: 'Pago enviado', color: 'text-yellow-700', dot: 'bg-yellow-400' },
  confirmed: { label: 'Confirmado', color: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-600', dot: 'bg-red-400' },
}

export default function DashboardClient({ classes }: { classes: any[] }) {
  const [expandedClass, setExpandedClass] = useState<string | null>(classes[0]?.id ?? null)
  const [loadingEnrollment, setLoadingEnrollment] = useState<string | null>(null)
  const [classData, setClassData] = useState(classes)

  async function handlePaymentAction(enrollmentId: string, paymentId: string, action: 'verified' | 'rejected') {
    setLoadingEnrollment(enrollmentId)
    const supabase = createClient()

    await supabase.from('payments').update({
      status: action,
      verified_at: action === 'verified' ? new Date().toISOString() : null,
    }).eq('id', paymentId)

    await supabase.from('enrollments').update({
      status: action === 'verified' ? 'confirmed' : 'pending_payment',
    }).eq('id', enrollmentId)

    // Update local state
    setClassData((prev) =>
      prev.map((cls) => ({
        ...cls,
        enrollments: cls.enrollments.map((e: any) => {
          if (e.id !== enrollmentId) return e
          return {
            ...e,
            status: action === 'verified' ? 'confirmed' : 'pending_payment',
            payment: e.payment.map((p: any) =>
              p.id === paymentId ? { ...p, status: action } : p
            ),
          }
        }),
      }))
    )

    setLoadingEnrollment(null)
  }

  const pendingPayments = classData.reduce((acc: number, cls: any) => {
    return acc + cls.enrollments.filter((e: any) => e.status === 'payment_submitted').length
  }, 0)

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis clases</h1>
          {pendingPayments > 0 && (
            <p className="text-sm text-yellow-700 font-medium mt-0.5">
              {pendingPayments} pago{pendingPayments !== 1 ? 's' : ''} por verificar
            </p>
          )}
        </div>
      </div>

      {classData.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No tienes clases publicadas aún</p>
        </div>
      ) : (
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
                    {enrollments.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-6">Sin inscripciones aún</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {enrollments.map((enrollment: any) => {
                          const student = enrollment.student
                          const payment = enrollment.payment?.[0] ?? enrollment.payment
                          const config = STATUS_CONFIG[enrollment.status as keyof typeof STATUS_CONFIG]
                          const isLoading = loadingEnrollment === enrollment.id

                          return (
                            <div key={enrollment.id} className="p-4 flex items-start gap-3">
                              <Avatar src={student?.avatar_url} name={student?.full_name ?? '?'} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900">{student?.full_name}</p>
                                  <span className={cn('flex items-center gap-1 text-xs font-medium', config.color)}>
                                    <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
                                    {config.label}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500">@{student?.username}</p>

                                {/* Payment receipt + actions */}
                                {enrollment.status === 'payment_submitted' && payment && (
                                  <div className="mt-2 space-y-2">
                                    {payment.receipt_url && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const res = await fetch(`/api/payment/receipt-url?paymentId=${payment.id}`)
                                          if (res.ok) {
                                            const { url } = await res.json()
                                            window.open(url, '_blank', 'noopener,noreferrer')
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                                      >
                                        Ver comprobante
                                        <ExternalLink className="h-3 w-3" />
                                      </button>
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
      )}
    </div>
  )
}
