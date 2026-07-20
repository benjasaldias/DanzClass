import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import { Users, AlertTriangle, CheckCircle2, Check, Paperclip, CreditCard, Lock } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import { formatCLP, paymentBreakdown, canPayByTransfer, effectiveClassPrice, type SubscriptionTier } from '@danceclass/shared'

const WEB_URL = 'https://dc-project-web.vercel.app'

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: 'Cuenta Corriente',
  cuenta_vista: 'Cuenta Vista',
  cuenta_rut: 'Cuenta RUT',
  cuenta_ahorro: 'Cuenta Ahorro',
}

export default function PaymentScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>()
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<any>(null)
  const [twoxRequest, setTwoxRequest] = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [success, setSuccess] = useState(false)
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [mpLoading, setMpLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!user) return
      setCurrentUserId(user.id)
      setAccessToken(session?.access_token ?? null)

      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('tier')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      setTier(((subRow as any)?.tier as SubscriptionTier) ?? 'none')

      const { data: enrollData } = await (supabase as any)
        .from('enrollments')
        .select('*, class:classes(*, teacher:profiles!teacher_id(*, payment_info:teacher_payment_info(*)))')
        .eq('id', enrollmentId)
        .single()
      setEnrollment(enrollData)

      // Fetch 2x request if applicable
      if (enrollData?.is_2x) {
        const { data: req2x } = await (supabase as any)
          .from('class_2x_requests')
          .select('*')
          .eq('class_id', enrollData.class.id)
          .in('user_id', [user.id, enrollData.partner_enrollment_id].filter(Boolean))
          .eq('status', 'matched')
          .maybeSingle()
        setTwoxRequest(req2x)
      }

      setLoading(false)
    }
    load()
  }, [enrollmentId])

  async function pickReceipt() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled) setReceipt(result.assets[0].uri)
  }

  async function copyToClipboard(value: string, label: string) {
    await Clipboard.setStringAsync(value)
    Alert.alert('Copiado', `${label} copiado al portapapeles`)
  }

  async function submitPayment() {
    if (!receipt || !currentUserId) return
    setUploading(true)

    const ext = receipt.split('.').pop() ?? 'jpg'
    const fileName = `${currentUserId}/${enrollmentId}.${ext}`
    const base64 = await FileSystem.readAsStringAsync(receipt, { encoding: FileSystem.EncodingType.Base64 })
    const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

    const { data: uploadData, error } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true })

    if (error) {
      Alert.alert('Error', 'No se pudo subir el comprobante')
      setUploading(false)
      return
    }

    // Bucket privado: guardamos el path, no la URL pública.
    const receiptPath = uploadData.path

    const amount = is2x && cls.price_2x ? cls.price_2x : effectiveClassPrice(cls)

    const existingPayment = Array.isArray(enrollment.payment) ? enrollment.payment[0] : enrollment.payment
    let paymentId: string | undefined = existingPayment?.id
    if (existingPayment?.id) {
      // Resubmission after a rejection — a new image means any previous AI
      // scan is stale, reset it so /api/payment/scan analyzes the new one.
      await (supabase as any).from('payments').update({
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
        commission_amount: 0,
        mp_payment_id: null,
        mp_status: null,
        scan_status: 'pending',
        scan_result: null,
        ai_verdict: 'none',
        confirmed_by: null,
        confirmed_at: null,
        operation_number: null,
      }).eq('id', existingPayment.id)
    } else {
      const { data: inserted } = await (supabase as any).from('payments').insert({
        enrollment_id: enrollmentId,
        amount,
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
      }).select('id').single()
      paymentId = inserted?.id
    }

    // status='payment_submitted' + limpiar el hold temporal (item 3).
    await supabase.from('enrollments').update({ status: 'payment_submitted', hold_expires_at: null } as any).eq('id', enrollmentId)

    // Best-effort: trigger the AI scan (only runs if the teacher opted in). Never
    // blocks the success screen — the teacher's manual review is the fallback.
    if (paymentId && accessToken) {
      fetch(`${WEB_URL}/api/payment/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ paymentId }),
      }).catch(() => {})
    }

    setSuccess(true)
    setUploading(false)
    setTimeout(() => router.back(), 2000)
  }

  async function handleMpPay() {
    if (!accessToken) return
    setMpLoading(true)
    try {
      const res = await fetch(`${WEB_URL}/api/mercadopago/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ enrollmentId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.init_point) {
        const msg = json.error === 'teacher_not_connected'
          ? 'Este profesor aún no tiene habilitado el pago in-app. Usa transferencia o inténtalo más tarde.'
          : 'No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo.'
        Alert.alert('Error', msg)
        setMpLoading(false)
        return
      }
      await WebBrowser.openBrowserAsync(json.init_point)
      // Al volver del checkout, la confirmación llega por webhook (Fase 4).
      router.back()
    } catch {
      Alert.alert('Error', 'No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo.')
      setMpLoading(false)
    }
  }

  async function handleTransfer() {
    if (!twoxRequest || !accessToken) return
    setTransferring(true)
    try {
      const res = await fetch(`${WEB_URL}/api/class-2x/transfer-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ request_id: twoxRequest.id }),
      })
      if (!res.ok) throw new Error('Error al transferir')
      Alert.alert('Transferido', 'Tu compañer@ recibirá una notificación para pagar.')
      // Refresh the page
      const { data: newReq } = await (supabase as any)
        .from('class_2x_requests')
        .select('*')
        .eq('id', twoxRequest.id)
        .single()
      setTwoxRequest(newReq)
    } catch {
      Alert.alert('Error', 'No se pudo transferir el turno de pago')
    }
    setTransferring(false)
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }
  if (!enrollment) return null

  const cls = enrollment.class
  const paymentInfo = Array.isArray(cls.teacher?.payment_info)
    ? cls.teacher.payment_info[0]
    : cls.teacher?.payment_info

  const is2x = !!enrollment.is_2x
  const missing2xPrice = is2x && !cls.price_2x
  const amount = is2x && cls.price_2x ? cls.price_2x : effectiveClassPrice(cls)
  const isMyTurnToPay = !is2x || !twoxRequest || twoxRequest.payment_assignee === currentUserId
  const alreadySubmitted = enrollment.status === 'payment_submitted'

  // Método de pago (marketplace): MP in-app con split, o transferencia (solo con plan).
  const teacherMpConnected = !!cls.teacher?.mp_connected
  const allowTransfer = canPayByTransfer(tier)
  const breakdown = paymentBreakdown(amount, tier)
  const showMp = teacherMpConnected && !is2x

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-dark-bg items-center justify-center px-6">
        <View className="mb-4">
          <Icon icon={CheckCircle2} size={56} stroke="#16a34a" />
        </View>
        <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">¡Comprobante enviado!</Text>
        <Text className="text-sm text-gray-500 dark:text-dark-text2 text-center mt-2">El profesor verificará tu pago pronto</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="bg-white dark:bg-dark-surface px-4 py-4 border-b border-gray-100 dark:border-dark-border flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-brand-600 text-base">‹ Volver</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Pagar clase</Text>
            <Text className="text-xs text-gris-humo dark:text-dark-text2">{cls.title}</Text>
          </View>
        </View>

        <View className="p-4 gap-4">
          {/* Missing 2x price warning */}
          {missing2xPrice && (
            <View className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 flex-row gap-3">
              <AlertTriangle size={18} stroke="#ca8a04" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-yellow-900 dark:text-yellow-300">El profesor no configuró precio 2x</Text>
                <Text className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">Se muestra el precio individual, no el 2x.</Text>
              </View>
            </View>
          )}

          {/* Partner pays banner */}
          {is2x && !isMyTurnToPay && (
            <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 gap-3">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 items-center justify-center">
                  <Users size={18} stroke="#d97706" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-amber-900 dark:text-amber-300">Tu compañer@ va a pagar</Text>
                  <Text className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    El monto 2x ({formatCLP(amount)}) está asignado a tu amig@.
                  </Text>
                </View>
              </View>
              <Text className="text-xs text-amber-600 dark:text-amber-400">
                Si quieres pagar tú, pídele que te transfiera el turno.
              </Text>
            </View>
          )}

          {/* Amount — only when it's this user's turn */}
          {isMyTurnToPay && (
            <View className="bg-brand-50 dark:bg-brand-950/30 rounded-2xl p-5 border border-brand-100 dark:border-brand-900/50">
              <Text className="text-brand-700 dark:text-brand-300 font-medium text-sm mb-1">
                {breakdown.commission > 0 ? 'Total a pagar' : 'Monto a transferir'}
              </Text>
              <Text className="text-4xl font-bold text-brand-900 dark:text-brand-200">
                {formatCLP(breakdown.commission > 0 ? breakdown.total : amount)}
              </Text>
              {breakdown.commission > 0 && (
                <View className="mt-2 gap-0.5">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-brand-700 dark:text-brand-300">Clase</Text>
                    <Text className="text-xs text-brand-700 dark:text-brand-300">{formatCLP(breakdown.base)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-brand-700 dark:text-brand-300">Comisión DanzClass (sin plan)</Text>
                    <Text className="text-xs text-brand-700 dark:text-brand-300">{formatCLP(breakdown.commission)}</Text>
                  </View>
                  <Text className="text-[11px] text-brand-600/70 dark:text-brand-400/70 pt-1">Con un plan no pagas comisión.</Text>
                </View>
              )}
              {is2x && <Text className="text-xs text-brand-600 dark:text-brand-400 mt-1">Precio 2x — cubre a ambos</Text>}
            </View>
          )}

          {/* Opción Mercado Pago (in-app con split) */}
          {isMyTurnToPay && showMp && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
              <View className="flex-row items-center gap-2">
                <CreditCard size={18} stroke="#009EE3" />
                <Text className="font-bold text-gray-900 dark:text-dark-text">Pagar con Mercado Pago</Text>
              </View>
              <Text className="text-xs text-gray-500 dark:text-dark-text2">
                Paga al instante con tarjeta, débito o saldo. Tu inscripción se confirma automáticamente al aprobarse el pago.
              </Text>
              <TouchableOpacity
                onPress={handleMpPay}
                disabled={mpLoading}
                className={`rounded-2xl py-4 items-center ${mpLoading ? 'bg-gray-300' : ''}`}
                style={mpLoading ? undefined : { backgroundColor: '#009EE3' }}
              >
                <Text className="text-white font-bold text-base">
                  {mpLoading ? 'Redirigiendo...' : `Pagar ${formatCLP(breakdown.total)} con Mercado Pago`}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sin plan: transferencia bloqueada */}
          {isMyTurnToPay && !allowTransfer && (
            <View className="bg-gray-50 dark:bg-dark-surface2/60 rounded-2xl p-4 border border-dashed border-gray-300 dark:border-dark-border gap-1">
              <View className="flex-row items-center gap-2">
                <Lock size={16} stroke="#9ca3af" />
                <Text className="font-semibold text-sm text-gray-500 dark:text-dark-text2">Transferencia directa al profesor</Text>
              </View>
              <Text className="text-xs text-gray-500 dark:text-dark-text2">
                {showMp
                  ? 'Disponible con un plan. Sin plan, paga in-app con Mercado Pago (arriba).'
                  : 'Este profesor aún no acepta pagos in-app y la transferencia requiere un plan. Obtén un plan para inscribirte.'}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(app)/plans' as any)} className="mt-2 self-start rounded-xl bg-brand-600 px-4 py-2">
                <Text className="text-white text-sm font-semibold">Ver planes</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Divisor si hay MP arriba */}
          {isMyTurnToPay && allowTransfer && showMp && (
            <View className="flex-row items-center gap-2">
              <View className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
              <Text className="text-xs text-gray-400 dark:text-dark-text2">o transfiere directo</Text>
              <View className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
            </View>
          )}

          {/* Bank details — solo con plan (allowTransfer) */}
          {isMyTurnToPay && allowTransfer && paymentInfo && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
              <Text className="font-bold text-gray-900 dark:text-dark-text">Datos de transferencia</Text>
              <Text className="text-xs text-gray-400 dark:text-dark-text2/60">Toca un campo para copiar</Text>
              {[
                { label: 'Banco', value: paymentInfo.bank_name, copyable: false },
                { label: 'Tipo', value: ACCOUNT_TYPE_LABELS[paymentInfo.account_type] ?? paymentInfo.account_type, copyable: false },
                { label: 'N° Cuenta', value: paymentInfo.account_number, copyable: true },
                { label: 'RUT', value: paymentInfo.rut, copyable: true },
                { label: 'Titular', value: paymentInfo.account_holder_name, copyable: false },
                { label: 'Email', value: paymentInfo.email, copyable: true },
              ].filter(({ value }) => !!value).map(({ label, value, copyable }) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => copyable && copyToClipboard(value, label)}
                  className="flex-row justify-between py-1"
                  disabled={!copyable}
                >
                  <Text className="text-xs text-gray-500 dark:text-dark-text2">{label}</Text>
                  <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isMyTurnToPay && allowTransfer && !paymentInfo && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border items-center">
              <Text className="text-sm text-gray-500 dark:text-dark-text2">El profesor aún no configuró sus datos bancarios.</Text>
            </View>
          )}

          {/* Receipt upload — solo transferencia (con plan) */}
          {isMyTurnToPay && allowTransfer && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
              <Text className="font-bold text-gray-900 dark:text-dark-text">
                {alreadySubmitted ? 'Comprobante enviado' : 'Comprobante de pago'}
              </Text>

              {alreadySubmitted ? (
                <View className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 flex-row items-center gap-2">
                  <Check size={16} stroke="#1d4ed8" />
                  <Text className="text-sm text-blue-700 dark:text-blue-400 flex-1">Tu comprobante fue enviado. El profesor lo está revisando.</Text>
                </View>
              ) : receipt ? (
                <View className="gap-2">
                  <Image source={{ uri: receipt }} className="w-full h-48 rounded-xl" resizeMode="contain" />
                  <TouchableOpacity onPress={pickReceipt} className="items-center">
                    <Text className="text-brand-600 text-sm font-medium">Cambiar imagen</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={pickReceipt}
                  className="border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl p-8 items-center gap-2"
                >
                  <Icon icon={Paperclip} size={32} />
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Seleccionar comprobante</Text>
                  <Text className="text-xs text-gray-400 dark:text-dark-text2/60">JPG o PNG</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Submit button */}
          {isMyTurnToPay && allowTransfer && !alreadySubmitted && (
            <TouchableOpacity
              onPress={submitPayment}
              disabled={!receipt || uploading}
              className={`rounded-2xl py-4 items-center ${receipt && !uploading ? 'bg-brand-600' : 'bg-gray-300'}`}
            >
              <Text className="text-white font-bold text-base">
                {uploading ? 'Enviando...' : 'Enviar comprobante'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Transfer payment turn button */}
          {is2x && isMyTurnToPay && !alreadySubmitted && twoxRequest && (
            <TouchableOpacity
              onPress={handleTransfer}
              disabled={transferring}
              className="flex-row items-center justify-center gap-2 border border-gray-200 dark:border-dark-border rounded-2xl py-4"
            >
              <Users size={16} stroke="#6b7280" />
              <Text className="text-gray-600 dark:text-dark-text2 text-sm font-medium">
                {transferring ? 'Transfiriendo...' : 'Que pague mi compañer@'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
