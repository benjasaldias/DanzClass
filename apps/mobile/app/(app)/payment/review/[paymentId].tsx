import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft, CheckCircle2, XCircle, AlertTriangle, Sparkles, RotateCcw, FileText,
} from 'lucide-react-native'
import { useTheme } from '../../../../context/ThemeContext'
import { supabase } from '../../../../lib/supabase'
import Avatar from '../../../../components/ui/Avatar'
import { formatCLP } from '@danceclass/shared'

const WEB_URL = 'https://dc-project-web.vercel.app'

function isPdfPath(path: string | null): boolean {
  return !!path && path.toLowerCase().split('?')[0].endsWith('.pdf')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PaymentReviewScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>()
  const router = useRouter()
  const { isDark } = useTheme()

  const [payment, setPayment] = useState<any>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? null
      setAccessToken(token)

      const { data } = await (supabase as any)
        .from('payments')
        .select(`
          id, amount, status, receipt_url, submitted_at,
          scan_status, scan_result, ai_verdict, confirmed_by, confirmed_at, operation_number,
          enrollment:enrollments!inner(id, status, student_id,
            student:profiles!student_id(id, full_name, username, avatar_url),
            class:classes!inner(id, title, teacher_id))
        `)
        .eq('id', paymentId)
        .single()

      setPayment(data)
      setLoading(false)

      if (data?.receipt_url && token) {
        const res = await fetch(`${WEB_URL}/api/payment/receipt-url?paymentId=${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const { url } = await res.json()
          setReceiptUrl(url)
        }
      }
      setReceiptLoading(false)
    }
    load()
  }, [paymentId])

  async function runAction(action: 'confirm' | 'reject' | 'revert') {
    if (!accessToken) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`${WEB_URL}/api/payment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paymentId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo procesar la acción')
        return
      }
      setPayment((prev: any) => ({
        ...prev,
        status: data.paymentStatus,
        confirmed_by: action === 'revert' ? null : 'teacher',
        confirmed_at: action === 'revert' ? null : new Date().toISOString(),
        enrollment: { ...prev.enrollment, status: data.enrollmentStatus },
      }))
    } catch {
      setError('Error de red. Intenta de nuevo.')
    } finally {
      setActionLoading(false)
    }
  }

  function confirmReject() {
    Alert.alert(
      'Rechazar pago',
      `¿Rechazar el comprobante de ${payment?.enrollment?.student?.full_name}? El alumno podrá subir uno nuevo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Rechazar', style: 'destructive', onPress: () => runAction('reject') },
      ]
    )
  }

  function confirmRevert() {
    Alert.alert(
      'Revertir confirmación automática',
      'Este pago fue confirmado automáticamente por la IA. Al revertirlo, el alumno vuelve a quedar pendiente de tu revisión manual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Revertir', onPress: () => runAction('revert') },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  if (!payment) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <Text className="text-gray-500 dark:text-dark-text2">Pago no encontrado</Text>
      </SafeAreaView>
    )
  }

  const enrollment = payment.enrollment
  const student = enrollment?.student
  const cls = enrollment?.class
  const scanResult = payment.scan_result as { fields?: Record<string, unknown>; issues?: string[] } | null

  const autoConfirmedByAi = payment.confirmed_by === 'ai' && payment.status === 'verified'
  const isTerminalReadOnly = !autoConfirmedByAi && (payment.status === 'verified' || payment.status === 'rejected')
  const awaitingReview = payment.status === 'pending'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
          <ChevronLeft size={22} stroke={isDark ? '#EEEDFE' : '#374151'} />
          <Text className="text-sm text-gray-500 dark:text-dark-text2">Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 32, gap: 16 }}>
        <View>
          <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">Revisar pago</Text>
          <Text className="text-sm text-gray-500 dark:text-dark-text2 mt-0.5">{cls?.title}</Text>
        </View>

        <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex-row items-center gap-3">
          <Avatar url={student?.avatar_url ?? null} name={student?.full_name ?? '?'} size="md" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{student?.full_name}</Text>
            <Text className="text-xs text-gris-humo dark:text-dark-text2">@{student?.username}</Text>
          </View>
          <View className="items-end">
            <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{formatCLP(payment.amount)}</Text>
            <Text className="text-xs text-gray-400 dark:text-dark-text2">{formatDateTime(payment.submitted_at)}</Text>
          </View>
        </View>

        {/* Receipt */}
        <View>
          <Text className="font-semibold text-sm text-gray-900 dark:text-dark-text mb-2">Comprobante</Text>
          <View className="bg-gray-50 dark:bg-dark-surface rounded-2xl p-3 items-center justify-center" style={{ minHeight: 160 }}>
            {receiptLoading ? (
              <ActivityIndicator color="#9ca3af" />
            ) : !receiptUrl ? (
              <Text className="text-sm text-gray-400 dark:text-dark-text2">Sin comprobante adjunto</Text>
            ) : isPdfPath(payment.receipt_url) ? (
              <TouchableOpacity onPress={() => Linking.openURL(receiptUrl)} className="flex-row items-center gap-1.5">
                <FileText size={16} stroke="#c026d3" />
                <Text className="text-sm text-brand-600 font-medium">Abrir comprobante (PDF) ↗</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => Linking.openURL(receiptUrl)}>
                <Image source={{ uri: receiptUrl }} style={{ width: 260, height: 260, borderRadius: 12 }} resizeMode="contain" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* AI extracted fields */}
        {scanResult && (scanResult.fields || scanResult.issues?.length) && (
          <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 gap-2">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Sparkles size={16} stroke="#7F77DD" />
              <Text className="font-semibold text-sm text-gray-900 dark:text-dark-text">Datos extraídos por IA</Text>
            </View>
            {scanResult.fields && Object.entries(scanResult.fields).map(([key, value]) => (
              <View key={key} className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-500 dark:text-dark-text2 capitalize">{key.replace(/_/g, ' ')}</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">{String(value)}</Text>
              </View>
            ))}
          </View>
        )}

        {error && (
          <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text>
          </View>
        )}

        {autoConfirmedByAi && (
          <View className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 gap-3">
            <View className="flex-row items-start gap-2.5">
              <CheckCircle2 size={18} stroke="#2563eb" />
              <Text className="flex-1 text-sm text-blue-700 dark:text-blue-400">
                <Text className="font-semibold">Confirmado automáticamente por IA.</Text> El alumno ya ve su inscripción como confirmada.
              </Text>
            </View>
            <TouchableOpacity
              onPress={confirmRevert}
              disabled={actionLoading}
              className="self-start flex-row items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-700 px-3 py-1.5"
            >
              <RotateCcw size={14} stroke="#2563eb" />
              <Text className="text-xs font-semibold text-blue-700 dark:text-blue-400">Revertir confirmación</Text>
            </TouchableOpacity>
          </View>
        )}

        {isTerminalReadOnly && (
          <View className={`rounded-2xl p-4 flex-row items-center gap-2.5 border ${
            payment.status === 'verified'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            {payment.status === 'verified'
              ? <CheckCircle2 size={18} stroke="#16a34a" />
              : <XCircle size={18} stroke="#dc2626" />}
            <Text className={`text-sm font-medium ${payment.status === 'verified' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {payment.status === 'verified' ? 'Pago confirmado' : 'Pago rechazado'}
            </Text>
          </View>
        )}

        {awaitingReview && payment.ai_verdict === 'clean' && (
          <View className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 gap-3">
            <View className="flex-row items-start gap-2.5">
              <Sparkles size={18} stroke="#16a34a" />
              <Text className="flex-1 text-sm text-green-700 dark:text-green-400">No vemos ningún problema. ¿Confirmas el pago?</Text>
            </View>
            <TouchableOpacity
              onPress={() => runAction('confirm')}
              disabled={actionLoading}
              className="self-start flex-row items-center gap-1.5 bg-green-600 rounded-lg px-4 py-2"
            >
              <CheckCircle2 size={16} stroke="white" />
              <Text className="text-white text-sm font-semibold">Confirmar</Text>
            </TouchableOpacity>
          </View>
        )}

        {awaitingReview && payment.ai_verdict === 'issue' && (
          <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 gap-3">
            <View className="flex-row items-start gap-2.5">
              <AlertTriangle size={18} stroke="#d97706" />
              <Text className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                <Text className="font-semibold">Detectamos un problema:</Text>{' '}
                {scanResult?.issues?.length ? scanResult.issues.join(', ') : 'revisa el comprobante con atención'}. ¿Confirmas el pago?
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => runAction('confirm')}
                disabled={actionLoading}
                className="flex-row items-center gap-1.5 bg-green-600 rounded-lg px-4 py-2"
              >
                <CheckCircle2 size={16} stroke="white" />
                <Text className="text-white text-sm font-semibold">Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmReject}
                disabled={actionLoading}
                className="flex-row items-center gap-1.5 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2"
              >
                <XCircle size={16} stroke="#dc2626" />
                <Text className="text-red-600 dark:text-red-400 text-sm font-semibold">Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {awaitingReview && payment.ai_verdict === 'none' && (
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => runAction('confirm')}
              disabled={actionLoading}
              className="flex-1 flex-row items-center justify-center gap-1.5 bg-green-600 rounded-lg px-4 py-2.5"
            >
              <CheckCircle2 size={16} stroke="white" />
              <Text className="text-white text-sm font-semibold">Confirmar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmReject}
              disabled={actionLoading}
              className="flex-1 flex-row items-center justify-center gap-1.5 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5"
            >
              <XCircle size={16} stroke="#dc2626" />
              <Text className="text-red-600 dark:text-red-400 text-sm font-semibold">Rechazar</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
