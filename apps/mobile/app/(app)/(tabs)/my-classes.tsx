import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CheckCircle2, XCircle, AlertTriangle, Trash2, ChevronDown, ChevronUp, ShieldAlert, BookOpen, GraduationCap } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import { DAYS_OF_WEEK, formatCLP } from '@danceclass/shared'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
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
  pending_payment: { label: 'Pendiente de pago', color: 'text-gray-500' },
  payment_submitted: { label: 'Verificando pago', color: 'text-yellow-600' },
  confirmed: { label: '✓ Confirmado', color: 'text-green-600' },
  cancelled: { label: 'Cancelado', color: 'text-red-500' },
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
        <View className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3">
          <Text className="text-yellow-700 text-sm font-semibold">
            {pendingPayments} pago{pendingPayments !== 1 ? 's' : ''} por verificar
          </Text>
        </View>
      )}

      {/* Debtors section */}
      {debtors.length > 0 && (
        <View className="bg-red-50 border border-red-200 rounded-2xl p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <ShieldAlert size={15} stroke="#dc2626" />
            <Text className="text-red-700 font-semibold text-sm">Pagos pendientes de clases pasadas</Text>
          </View>
          <Text className="text-red-600 text-xs">Resuelve estos pagos directamente con el alumno.</Text>
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
                    <Text className="text-xs text-green-700 font-medium">{confirmed} confirmados</Text>
                    {pending > 0 && (
                      <Text className="text-xs text-yellow-700 font-medium">• {pending} por verificar</Text>
                    )}
                    <Text className="text-xs text-gris-humo">{total}/{cls.max_spots} cupos</Text>
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
                                  <Text className="text-red-600 text-xs font-semibold">Rechazar</Text>
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MyClassesScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'enrolled' | 'teaching'>('enrolled')
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
        .select('*, class:classes(*, teacher:profiles!teacher_id(*))')
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
            <Text className={`text-sm font-semibold ${tab === 'enrolled' ? 'text-gray-900 dark:text-dark-text' : 'text-gray-500 dark:text-dark-text2'}`}>
              Clases que tomo
              {enrollments.length > 0 ? ` (${enrollments.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('teaching')}
            className={`flex-1 rounded-lg py-2 items-center ${tab === 'teaching' ? 'bg-white dark:bg-dark-surface shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${tab === 'teaching' ? 'text-gray-900 dark:text-dark-text' : 'text-gray-500 dark:text-dark-text2'}`}>
              Clases que dicto
              {teachingClasses.length > 0 ? ` (${teachingClasses.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {tab === 'enrolled'
          ? <EnrolledTab
              enrollments={enrollments}
              onPressClass={(id) => router.push(`/(app)/class/${id}` as any)}
              onPressPayment={(id) => router.push(`/(app)/payment/${id}` as any)}
            />
          : userId
            ? <TeachingTab classes={teachingClasses} currentUserId={userId} dismissedIds={dismissedIds} />
            : null
        }
      </ScrollView>
    </SafeAreaView>
  )
}
