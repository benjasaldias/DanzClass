import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CheckCircle2, XCircle, AlertTriangle, Trash2, ChevronDown, ChevronUp, ShieldAlert, BookOpen, GraduationCap, History, Receipt } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import { DAYS_OF_WEEK, formatCLP } from '@danceclass/shared'

function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function formatDeletionDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function isDeleted(deletionDate: string | null): boolean {
  if (!deletionDate) return false
  return new Date(deletionDate) <= new Date()
}
function classSchedule(cls: any) {
  if (!cls) return ''
  if (cls.type === 'suelta') return `${formatDate(cls.date)} · ${formatTime(cls.time)}`
  return `${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`
}

const ENROLL_STATUS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: 'text-gray-500 dark:text-gray-400' },
  payment_submitted: { label: 'Verificando pago', color: 'text-yellow-600 dark:text-yellow-400' },
  confirmed: { label: '✓ Confirmado', color: 'text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelado', color: 'text-red-500 dark:text-red-400' },
}

// ─── Enrolled tab ─────────────────────────────────────────────────────────────

function EnrolledTab({ enrollments, onPressClass, onPressPayment }: {
  enrollments: any[]
  onPressClass: (classId: string) => void
  onPressPayment: (enrollmentId: string) => void
}) {
  if (enrollments.length === 0) {
    return (
      <View className="items-center py-16">
        <View className="mb-3">
          <Icon icon={BookOpen} size={32} />
        </View>
        <Text className="text-gray-500 dark:text-dark-text2 text-sm font-medium">Sin clases inscritas</Text>
        <Text className="text-gray-400 dark:text-dark-text2/60 text-xs mt-1">Explora clases y apúntate</Text>
      </View>
    )
  }

  return (
    <View className="gap-3 pb-8">
      {enrollments.map((enrollment) => {
        const cls = enrollment.class
        const teacher = cls?.teacher
        const config = ENROLL_STATUS[enrollment.status] ?? { label: enrollment.status, color: 'text-gray-500' }

        return (
          <TouchableOpacity
            key={enrollment.id}
            onPress={() => onPressClass(cls?.id)}
            className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border shadow-sm"
          >
            <Text className="font-bold text-gray-900 dark:text-dark-text text-sm">{cls?.title}</Text>
            <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">{teacher?.full_name}</Text>
            <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-1">{classSchedule(cls)}</Text>
            <Text className={`text-xs font-medium mt-2 ${config.color}`}>{config.label}</Text>

            {enrollment.status === 'pending_payment' && (
              <TouchableOpacity
                onPress={() => onPressPayment(enrollment.id)}
                className="mt-2 bg-brand-600 rounded-xl py-2 items-center"
              >
                <Text className="text-white font-semibold text-sm">
                  Ir a pagar · {formatCLP(cls?.price)}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Teaching tab ─────────────────────────────────────────────────────────────

function TeachingTab({
  classes: initialClasses,
  currentUserId,
  dismissedIds: initialDismissed,
}: {
  classes: any[]
  currentUserId: string
  dismissedIds: string[]
}) {
  const [classData, setClassData] = useState(initialClasses)
  const [dismissedIds, setDismissedIds] = useState<string[]>(initialDismissed)
  const [expandedClass, setExpandedClass] = useState<string | null>(initialClasses[0]?.id ?? null)
  const [loadingEnrollment, setLoadingEnrollment] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const debtors = classData.flatMap((cls: any) =>
    cls.enrollments
      .filter((e: any) =>
        e.status === 'pending_payment' &&
        !dismissedIds.includes(e.student?.id ?? e.student_id) &&
        cls.type === 'suelta' && cls.date && cls.date < today
      )
      .map((e: any) => ({
        enrollmentId: e.id,
        student: e.student,
        classTitle: cls.title,
        studentId: e.student?.id ?? e.student_id,
      }))
  )

  async function handlePaymentAction(enrollmentId: string, paymentId: string, action: 'verified' | 'rejected') {
    setLoadingEnrollment(enrollmentId)
    const newStatus = action === 'verified' ? 'confirmed' : 'pending_payment'
    const notifType = action === 'verified' ? 'payment_confirmed' : 'payment_rejected'

    await supabase.from('payments').update({
      status: action,
      verified_at: action === 'verified' ? new Date().toISOString() : null,
    }).eq('id', paymentId)

    await supabase.from('enrollments').update({ status: newStatus }).eq('id', enrollmentId)

    const enrollment = classData.flatMap((c: any) => c.enrollments).find((e: any) => e.id === enrollmentId)
    if (enrollment) {
      await (supabase as any).from('notifications').insert({
        user_id: enrollment.student?.id ?? enrollment.student_id,
        type: notifType,
        data: { class_id: classData.find((c: any) => c.enrollments.some((e: any) => e.id === enrollmentId))?.id },
      })
    }

    setClassData((prev) =>
      prev.map((cls) => ({
        ...cls,
        enrollments: cls.enrollments.map((e: any) => {
          if (e.id !== enrollmentId) return e
          return {
            ...e,
            status: newStatus,
            payment: e.payment?.map((p: any) => p.id === paymentId ? { ...p, status: action } : p),
          }
        }),
      }))
    )
    setLoadingEnrollment(null)
  }

  async function handleRemoveStudent(enrollmentId: string, studentName: string) {
    Alert.alert(
      'Eliminar alumno',
      `¿Eliminar a ${studentName} de la clase?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('enrollments').update({ status: 'cancelled' }).eq('id', enrollmentId)
            setClassData((prev) =>
              prev.map((cls) => ({
                ...cls,
                enrollments: cls.enrollments.map((e: any) =>
                  e.id === enrollmentId ? { ...e, status: 'cancelled' } : e
                ),
              }))
            )
          },
        },
      ]
    )
  }

  async function handleDebtConfirmed(studentId: string) {
    await (supabase as any).from('dismissed_debts').upsert(
      { teacher_id: currentUserId, student_id: studentId },
      { onConflict: 'teacher_id,student_id', ignoreDuplicates: true }
    )
    setDismissedIds((prev) => [...prev, studentId])
  }

  if (classData.length === 0) {
    return (
      <View className="items-center py-16">
        <View className="mb-3">
          <Icon icon={GraduationCap} size={32} />
        </View>
        <Text className="text-gray-500 dark:text-dark-text2 text-sm font-medium">Sin clases publicadas</Text>
        <Text className="text-gray-400 dark:text-dark-text2/60 text-xs mt-1">Publica tu primera clase</Text>
      </View>
    )
  }

  const pendingPayments = classData.reduce(
    (acc, cls) => acc + cls.enrollments.filter((e: any) => e.status === 'payment_submitted').length,
    0
  )

  return (
    <View className="gap-3 pb-8">
      {pendingPayments > 0 && (
        <View className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl px-4 py-3">
          <Text className="text-yellow-700 dark:text-yellow-400 text-sm font-semibold">
            {pendingPayments} pago{pendingPayments !== 1 ? 's' : ''} por verificar
          </Text>
        </View>
      )}

      {/* Debtors section */}
      {debtors.length > 0 && (
        <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <ShieldAlert size={15} stroke="#dc2626" />
            <Text className="text-red-700 dark:text-red-400 font-semibold text-sm">Pagos pendientes de clases pasadas</Text>
          </View>
          <Text className="text-red-600 dark:text-red-400 text-xs">Resuelve estos pagos directamente con el alumno.</Text>
          <View className="gap-2">
            {debtors.map((d) => (
              <View key={d.enrollmentId} className="bg-white dark:bg-dark-surface border border-red-100 dark:border-red-900/40 rounded-xl p-3 flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-red-100 items-center justify-center">
                  <Text className="text-red-600 text-xs font-bold">
                    {d.student?.full_name?.charAt(0) ?? '?'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{d.student?.full_name}</Text>
                  <Text className="text-xs text-gray-500 dark:text-dark-text2">@{d.student?.username} · {d.classTitle}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDebtConfirmed(d.studentId)}
                  className="bg-green-600 rounded-lg px-3 py-1.5"
                >
                  <Text className="text-white text-xs font-semibold">Pago confirmado</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Classes list */}
      {classData.map((cls) => {
        const isExpanded = expandedClass === cls.id
        const enrollments = cls.enrollments ?? []
        const confirmed = enrollments.filter((e: any) => e.status === 'confirmed').length
        const pending = enrollments.filter((e: any) => e.status === 'payment_submitted').length
        const total = enrollments.filter((e: any) => e.status !== 'cancelled').length
        const deleted = isDeleted(cls.deletion_date)

        return (
          <View key={cls.id} className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm overflow-hidden">
            <TouchableOpacity
              onPress={() => setExpandedClass(isExpanded ? null : cls.id)}
              className="p-4"
            >
              <View className="flex-row items-start">
                <View className="flex-1">
                  <Text className="font-bold text-gray-900 dark:text-dark-text text-sm">{cls.title}</Text>
                  <Text className="text-xs text-gris-humo dark:text-dark-text2 mt-0.5">{classSchedule(cls)}</Text>
                  <View className="flex-row gap-3 mt-1.5 flex-wrap">
                    <Text className="text-xs text-green-700 dark:text-green-400 font-medium">{confirmed} confirmados</Text>
                    {pending > 0 && (
                      <Text className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">• {pending} por verificar</Text>
                    )}
                    <Text className="text-xs text-gris-humo dark:text-dark-text2">{total}/{cls.max_spots} cupos</Text>
                  </View>

                  {/* Deletion warning */}
                  {cls.deletion_date && !deleted && (
                    <View className="flex-row items-center gap-1 mt-1.5">
                      <AlertTriangle size={11} stroke="#D85A30" />
                      <Text className="text-xs" style={{ color: '#D85A30' }}>
                        Archivos eliminados el {formatDeletionDate(cls.deletion_date)}
                      </Text>
                    </View>
                  )}
                  {deleted && (
                    <View className="flex-row items-center gap-1 mt-1.5">
                      <Trash2 size={11} stroke="#9ca3af" />
                      <Text className="text-xs text-gray-400">Archivos eliminados</Text>
                    </View>
                  )}
                </View>
                <View className="ml-2 mt-0.5">
                  {isExpanded
                    ? <ChevronUp size={16} stroke="#9ca3af" />
                    : <ChevronDown size={16} stroke="#9ca3af" />
                  }
                </View>
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View className="border-t border-gray-100 dark:border-dark-border">
                {total === 0 ? (
                  <Text className="text-center text-sm text-gray-400 dark:text-dark-text2/60 py-6">Sin inscripciones aún</Text>
                ) : (
                  <View>
                    {enrollments.filter((e: any) => e.status !== 'cancelled').map((enrollment: any) => {
                      const student = enrollment.student
                      const payment = Array.isArray(enrollment.payment)
                        ? enrollment.payment[0]
                        : enrollment.payment
                      const isLoading = loadingEnrollment === enrollment.id

                      return (
                        <View key={enrollment.id} className="p-4 border-t border-gray-50 dark:border-dark-border/40">
                          <View className="flex-row items-center gap-3">
                            <View className="w-8 h-8 rounded-full bg-lavanda-suave items-center justify-center">
                              <Text className="text-xs font-bold" style={{ color: '#534AB7' }}>
                                {student?.full_name?.charAt(0) ?? '?'}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{student?.full_name}</Text>
                              <Text className="text-xs text-gris-humo dark:text-dark-text2">@{student?.username}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleRemoveStudent(enrollment.id, student?.full_name ?? 'este alumno')}
                              className="p-1"
                            >
                              <XCircle size={16} stroke="#ef4444" />
                            </TouchableOpacity>
                          </View>

                          <View className="mt-2 ml-11">
                            <Text className="text-xs text-gris-humo dark:text-dark-text2">
                              {ENROLL_STATUS[enrollment.status]?.label ?? enrollment.status}
                            </Text>
                          </View>

                          {/* Payment verification */}
                          {enrollment.status === 'payment_submitted' && payment && (
                            <View className="mt-3 ml-11 gap-2">
                              {payment.receipt_url && (
                                <TouchableOpacity onPress={() => Linking.openURL(payment.receipt_url)}>
                                  <Text className="text-xs text-brand-600 font-medium">Ver comprobante ↗</Text>
                                </TouchableOpacity>
                              )}
                              <Text className="text-xs text-gris-humo dark:text-dark-text2">Monto: {formatCLP(payment.amount)}</Text>
                              <View className="flex-row gap-2">
                                <TouchableOpacity
                                  onPress={() => handlePaymentAction(enrollment.id, payment.id, 'verified')}
                                  disabled={!!isLoading}
                                  className={`flex-row items-center gap-1.5 bg-green-600 rounded-lg px-3 py-2 ${isLoading ? 'opacity-50' : ''}`}
                                >
                                  <CheckCircle2 size={13} stroke="white" />
                                  <Text className="text-white text-xs font-semibold">Confirmar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handlePaymentAction(enrollment.id, payment.id, 'rejected')}
                                  disabled={!!isLoading}
                                  className={`flex-row items-center gap-1.5 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 ${isLoading ? 'opacity-50' : ''}`}
                                >
                                  <XCircle size={13} stroke="#ef4444" />
                                  <Text className="text-red-600 dark:text-red-400 text-xs font-semibold">Rechazar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────────

const PAYMENT_PILL_COLORS: Record<string, { container: string; text: string }> = {
  confirmed: { container: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400' },
  rejected: { container: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800', text: 'text-red-600 dark:text-red-400' },
  pending: { container: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800', text: 'text-yellow-800 dark:text-yellow-400' },
  no_payment: { container: 'bg-gray-50 dark:bg-dark-surface2 border-gray-200 dark:border-dark-border', text: 'text-gray-500 dark:text-dark-text2' },
}

function getPaymentKey(enrollment: any): keyof typeof PAYMENT_PILL_COLORS {
  const payment = Array.isArray(enrollment.payment) ? enrollment.payment[0] : enrollment.payment
  if (enrollment.status === 'confirmed') return 'confirmed'
  if (payment?.status === 'rejected') return 'rejected'
  if (enrollment.status === 'payment_submitted' || payment) return 'pending'
  return 'no_payment'
}

const PAYMENT_KEY_LABEL: Record<string, string> = {
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
  no_payment: 'Sin pago',
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

  // Monthly summary for teacher view (only confirmed payments)
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
      <View className="items-center py-16">
        <View className="mb-3">
          <Icon icon={History} size={32} />
        </View>
        <Text className="text-gray-500 dark:text-dark-text2 text-sm font-medium">Sin historial de pagos</Text>
        <Text className="text-gray-400 dark:text-dark-text2/60 text-xs mt-1 text-center px-8">
          Aquí verás tus pagos al inscribirte en clases
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-5 pb-8">
      {/* Student section */}
      {hasStudent && (
        <View>
          {hasTeacher && (
            <Text className="text-sm font-semibold text-gray-600 dark:text-dark-text2 mb-3">Mis pagos</Text>
          )}
          <View className="gap-2">
            {enrollments.map((e: any) => {
              const cls = e.class
              const payment = Array.isArray(e.payment) ? e.payment[0] : e.payment
              const statusKey = getPaymentKey(e)
              const pill = PAYMENT_PILL_COLORS[statusKey]
              return (
                <View key={e.id} className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border shadow-sm">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1 min-w-0">
                      <Text className="font-bold text-gray-900 dark:text-dark-text text-sm" numberOfLines={1}>{cls?.title}</Text>
                      {cls?.dance_style && (
                        <View className="bg-brand-50 self-start rounded-full px-2 py-0.5 mt-0.5">
                          <Text className="text-brand-700 text-xs font-medium">{cls.dance_style}</Text>
                        </View>
                      )}
                      <Text className="text-sm font-semibold text-gray-800 dark:text-dark-text mt-1">
                        {payment?.amount ? formatCLP(payment.amount) : 'Sin pago registrado'}
                      </Text>
                      <Text className="text-xs text-gray-400 dark:text-dark-text2 mt-0.5">
                        {new Date(e.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2.5 py-1 border ${pill.container}`}>
                      <Text className={`text-xs font-medium ${pill.text}`}>{PAYMENT_KEY_LABEL[statusKey]}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* Teacher section */}
      {hasTeacher && (
        <View>
          {hasStudent && (
            <Text className="text-sm font-semibold text-gray-600 dark:text-dark-text2 mb-3">Pagos recibidos</Text>
          )}
          <View className="gap-2">
            {teacherRows.map((row: any) => {
              const statusKey = row.enrollmentStatus === 'confirmed' ? 'confirmed'
                : row.payment?.status === 'rejected' ? 'rejected'
                : row.enrollmentStatus === 'payment_submitted' || row.payment ? 'pending'
                : 'no_payment'
              const pill = PAYMENT_PILL_COLORS[statusKey]
              return (
                <View key={row.id} className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border shadow-sm flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-full bg-lavanda-suave items-center justify-center flex-shrink-0">
                    <Text className="text-xs font-bold" style={{ color: '#534AB7' }}>
                      {row.student?.full_name?.charAt(0) ?? '?'}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-semibold text-sm text-gray-900 dark:text-dark-text" numberOfLines={1}>
                      {row.student?.full_name}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-dark-text2" numberOfLines={1}>{row.classTitle}</Text>
                    <Text className="text-sm font-semibold text-gray-800 dark:text-dark-text mt-0.5">
                      {row.payment?.amount ? formatCLP(row.payment.amount) : '—'}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <View className={`rounded-full px-2.5 py-1 border ${pill.container}`}>
                      <Text className={`text-xs font-medium ${pill.text}`}>{PAYMENT_KEY_LABEL[statusKey]}</Text>
                    </View>
                    <Text className="text-xs text-gray-400 dark:text-dark-text2">
                      {new Date(row.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>

          {/* Monthly summary */}
          {monthlySummary.length > 0 && (
            <View className="mt-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Receipt size={15} stroke="#9ca3af" />
                <Text className="text-sm font-semibold text-gray-600 dark:text-dark-text2">Resumen mensual</Text>
              </View>
              <View className="gap-2">
                {monthlySummary.map(([month, { total, count }]) => (
                  <View key={month} className="rounded-2xl px-4 py-3 bg-violet-50 dark:bg-dark-surface2 border border-violet-100 dark:border-dark-border">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-gray-700 dark:text-dark-text capitalize">{month}</Text>
                      <View className="items-end">
                        <Text className="text-sm font-bold text-green-600 dark:text-green-400">{formatCLP(total)}</Text>
                        <Text className="text-xs text-gray-500 dark:text-dark-text2">
                          {count} pago{count !== 1 ? 's' : ''} confirmado{count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MyClassesScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'enrolled' | 'teaching' | 'history'>('enrolled')
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [teachingClasses, setTeachingClasses] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [enrollRes, teachRes, dismissedRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('*, class:classes(*, teacher:profiles!teacher_id(*)), payment:payments(*)')
        .eq('student_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('classes')
        .select('*, enrollments(*, student:profiles!student_id(id, full_name, username, avatar_url), payment:payments(*))')
        .eq('teacher_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('dismissed_debts')
        .select('student_id')
        .eq('teacher_id', user.id),
    ])

    setEnrollments(enrollRes.data ?? [])
    setTeachingClasses(teachRes.data ?? [])
    setDismissedIds((dismissedRes.data ?? []).map((d: any) => d.student_id))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
      <ActivityIndicator color="#c026d3" />
    </SafeAreaView>
  )

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg">
      <View className="px-4 py-4 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">Mis clases</Text>
      </View>

      {/* Tab toggle */}
      <View className="px-4 pt-4 pb-0">
        <View className="flex-row bg-gray-100 dark:bg-dark-surface2 rounded-xl p-1 gap-1">
          <TouchableOpacity
            onPress={() => setTab('enrolled')}
            className={`flex-1 rounded-lg py-2 items-center ${tab === 'enrolled' ? 'bg-white dark:bg-dark-surface shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold ${tab === 'enrolled' ? 'text-gray-900 dark:text-dark-text' : 'text-gray-500 dark:text-dark-text2'}`}>
              Que tomo{enrollments.length > 0 ? ` (${enrollments.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('teaching')}
            className={`flex-1 rounded-lg py-2 items-center ${tab === 'teaching' ? 'bg-white dark:bg-dark-surface shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold ${tab === 'teaching' ? 'text-gray-900 dark:text-dark-text' : 'text-gray-500 dark:text-dark-text2'}`}>
              Que dicto{teachingClasses.length > 0 ? ` (${teachingClasses.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('history')}
            className={`flex-1 rounded-lg py-2 items-center ${tab === 'history' ? 'bg-white dark:bg-dark-surface shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold ${tab === 'history' ? 'text-gray-900 dark:text-dark-text' : 'text-gray-500 dark:text-dark-text2'}`}>
              Historial
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {tab === 'enrolled' && (
          <EnrolledTab
            enrollments={enrollments}
            onPressClass={(id) => router.push(`/(app)/class/${id}` as any)}
            onPressPayment={(id) => router.push(`/(app)/payment/${id}` as any)}
          />
        )}
        {tab === 'teaching' && userId && (
          <TeachingTab classes={teachingClasses} currentUserId={userId} dismissedIds={dismissedIds} />
        )}
        {tab === 'history' && (
          <HistoryTab enrollments={enrollments} teachingClasses={teachingClasses} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
