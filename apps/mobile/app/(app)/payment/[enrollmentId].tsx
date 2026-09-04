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
import { Users, AlertTriangle, CheckCircle2, Check, Paperclip, CreditCard, Building2 } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import {
  formatCLP, paymentBreakdown, effectiveClassPrice, twoxClassPrice, formatBillingPeriod,
  detectReceiptType, getActiveTier, WEB_URL,
  type SubscriptionTier, type DebtSummary, type MonthlyCharge,
} from '@danceclass/shared'

const MP_ERRORS: Record<string, string> = {
  teacher_not_connected: 'Este profesor aún no tiene habilitado el pago in-app. Usa transferencia o inténtalo más tarde.',
  mp_not_accepted_for_class: 'Esta clase no acepta pago con Mercado Pago. Usa transferencia.',
  not_payment_turn: 'El turno de pago es de tu compañer@. Pídele que te lo transfiera desde la página de la clase.',
  twox_not_matched: 'No encontramos tu emparejamiento 2x activo. Vuelve a la clase e inténtalo de nuevo.',
  twox_price_missing: 'El profesor no configuró el precio 2x de esta clase. Contáctalo antes de pagar.',
  invalid_amount: 'No pudimos calcular el monto. Contacta al profesor.',
}

const CHARGE_PILL: Record<string, { label: string; color: string }> = {
  due: { label: 'Por pagar', color: 'text-coral-fuego' },
  rejected: { label: 'Rechazado', color: 'text-red-600 dark:text-red-400' },
  pending: { label: 'En revisión', color: 'text-yellow-700 dark:text-yellow-400' },
  verified: { label: 'Pagado', color: 'text-green-700 dark:text-green-400' },
}

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
  // Entrenamiento: deuda mensual acumulada (audit.md S4). La emite/consulta el
  // servidor porque `generate_monthly_charges` es service role.
  const [debt, setDebt] = useState<DebtSummary | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!user) return
      setCurrentUserId(user.id)
      setAccessToken(session?.access_token ?? null)

      setTier(await getActiveTier(user.id, supabase))

      const { data: enrollData } = await (supabase as any)
        .from('enrollments')
        .select('*, class:classes(*, teacher:profiles!teacher_id(*, payment_info:teacher_payment_info(*)))')
        .eq('id', enrollmentId)
        .single()
      setEnrollment(enrollData)

      // Fetch 2x request if applicable. El emparejamiento se busca por el
      // usuario actual en cualquiera de los dos lados (mismo criterio que la
      // page web): `partner_enrollment_id` es un id de enrollment, no de
      // usuario, así que no sirve para filtrar `user_id`.
      if (enrollData?.is_2x) {
        const { data: req2x } = await (supabase as any)
          .from('class_2x_requests')
          .select('*')
          .eq('class_id', enrollData.class.id)
          .or(`user_id.eq.${user.id},matched_with.eq.${user.id}`)
          .eq('status', 'matched')
          .maybeSingle()
        setTwoxRequest(req2x)
      }

      if (enrollData?.class?.type === 'entrenamiento' && session?.access_token) {
        try {
          const res = await fetch(
            `${WEB_URL}/api/payment/charges?enrollmentId=${encodeURIComponent(String(enrollmentId))}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          )
          const json = await res.json().catch(() => ({}))
          const summary: DebtSummary | null = json?.debt ?? null
          setDebt(summary)
          if (summary) {
            setSelectedIds(
              summary.overdue.length > 0
                ? summary.overdue.map((c: MonthlyCharge) => c.id)
                : summary.oldestUnpaid ? [summary.oldestUnpaid.id] : []
            )
          }
        } catch {
          // Sin deuda cargada la pantalla sigue funcionando: muestra el aviso de
          // "no pudimos cargar tus mensualidades" en vez de romperse.
          setDebt(null)
        }
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

    const base64 = await FileSystem.readAsStringAsync(receipt, { encoding: FileSystem.EncodingType.Base64 })
    const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

    // El tipo sale del CONTENIDO, no de la extensión del URI (D-4): así el
    // objeto queda con la extensión y el content-type correctos, y de paso
    // mobile gana la validación de formato que sólo tenía la web. Un formato no
    // reconocido (p. ej. HEIC de iPhone) se rechaza acá: el profesor no podría
    // abrirlo para revisarlo ni el escaneo IA leerlo.
    const detected = detectReceiptType(arrayBuffer)
    if (!detected) {
      Alert.alert('Formato no reconocido', 'Sube una imagen JPG, PNG o WEBP (una captura de pantalla sirve).')
      setUploading(false)
      return
    }

    // Un comprobante por (grupo de) mes(es): reusar el mismo path sobrescribiría
    // el del mes anterior, que el profesor todavía puede necesitar.
    const firstSelected = debt?.unpaid.find((c) => selectedIds.includes(c.id))
    const suffix = firstSelected ? `-${firstSelected.billing_period}` : ''
    const fileName = `${currentUserId}/${enrollmentId}${suffix}.${detected.ext}`

    const { data: uploadData, error } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, arrayBuffer, { contentType: detected.mime, upsert: true })

    if (error) {
      Alert.alert('Error', 'No se pudo subir el comprobante')
      setUploading(false)
      return
    }

    // Bucket privado: guardamos el path, no la URL pública.
    const receiptPath = uploadData.path

    // El registro del pago (insert/update en `payments` + `enrollments`) es
    // server-side: valida `accepts_transfer` y calcula el monto de forma
    // autoritativa, en vez de confiar en el cliente (ver /api/payment/submit-transfer).
    const submitRes = await fetch(`${WEB_URL}/api/payment/submit-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        enrollmentId,
        receiptPath,
        ...(debt ? { chargeIds: selectedIds } : {}),
      }),
    })

    if (!submitRes.ok) {
      Alert.alert('Error', 'No se pudo registrar el comprobante')
      setUploading(false)
      return
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
        body: JSON.stringify({
          enrollmentId,
          ...(debt && selectedIds[0] ? { chargeId: selectedIds[0] } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.init_point) {
        const msg = MP_ERRORS[json.error as string] ?? 'No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo.'
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
  // 2x usa su propio precio (price_2x ?? price_suelta_2x, sin descuento
  // espontáneo); la clase individual sí aplica el descuento activo.
  const twoxPrice = is2x ? twoxClassPrice(cls) : null
  const missing2xPrice = is2x && twoxPrice === null
  const isMyTurnToPay = !is2x || !twoxRequest || twoxRequest.payment_assignee === currentUserId

  // Entrenamiento: se paga por MES. El monto es la suma de las mensualidades
  // marcadas, y cada una conserva el importe con que se emitió.
  const debtMode = !!debt
  const selectedCharges: MonthlyCharge[] = debt
    ? debt.unpaid.filter((c) => selectedIds.includes(c.id))
    : []
  const debtAmount = selectedCharges.reduce((acc, c) => acc + c.amount, 0)
  const amount = debtMode ? debtAmount : (twoxPrice ?? effectiveClassPrice(cls))
  const nothingToPay = debtMode && debt!.unpaid.length === 0
  const canPayNow = !nothingToPay && (!debtMode || selectedCharges.length > 0)
  // En un entrenamiento el estado de la inscripción no dice nada sobre el mes en
  // curso: manda el estado de cada cargo.
  const alreadySubmitted = !debtMode && enrollment.status === 'payment_submitted'

  function toggleCharge(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Método de pago: lo decide el PROFESOR por clase (accepts_mp/accepts_transfer),
  // no el plan del alumno. MP además exige la cuenta del profesor conectada.
  const teacherMpConnected = !!cls.teacher?.mp_connected
  const acceptsMp = cls.accepts_mp !== false
  const acceptsTransfer = cls.accepts_transfer !== false
  const showMp = acceptsMp && teacherMpConnected && isMyTurnToPay && canPayNow
  const showTransfer = acceptsTransfer && isMyTurnToPay && canPayNow
  const noMethodAvailable =
    isMyTurnToPay && !nothingToPay && !(acceptsMp && teacherMpConnected) && !acceptsTransfer
  // MP cobra UN cargo por checkout (ver /api/mercadopago/create-payment).
  const mpNeedsSingleMonth = debtMode && selectedCharges.length > 1
  const mpAmount = debtMode ? (selectedCharges[0]?.amount ?? 0) : amount
  const mpBreakdown = paymentBreakdown(mpAmount, tier, 'mp')

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

          {/* Entrenamiento: mensualidades */}
          {debtMode && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-2">
              <Text className="font-bold text-gray-900 dark:text-dark-text">Mensualidades</Text>

              {debt!.charges.length === 0 ? (
                <Text className="text-sm text-gray-500 dark:text-dark-text2">
                  Todavía no hay mensualidades emitidas para tu inscripción.
                </Text>
              ) : (
                debt!.charges.map((c) => {
                  const selectable = c.status === 'due' || c.status === 'rejected'
                  const checked = selectedIds.includes(c.id)
                  const overdue = debt!.overdue.some((o) => o.id === c.id)
                  const pill = CHARGE_PILL[c.status] ?? CHARGE_PILL.due
                  return (
                    <TouchableOpacity
                      key={c.id}
                      activeOpacity={selectable ? 0.7 : 1}
                      onPress={selectable ? () => toggleCharge(c.id) : undefined}
                      className="flex-row items-center gap-3 py-2 border-b border-gray-50 dark:border-dark-border"
                    >
                      <View className={`h-5 w-5 rounded border items-center justify-center ${
                        selectable
                          ? (checked ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-dark-border')
                          : 'border-transparent'
                      }`}>
                        {selectable && checked && <Check size={13} stroke="#fff" />}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                          {formatBillingPeriod(c.billing_period)}
                        </Text>
                        {overdue && <Text className="text-xs text-coral-fuego">Vencida — bloquea tu QR</Text>}
                      </View>
                      <Text className={`text-[11px] font-medium ${pill.color}`}>{pill.label}</Text>
                      <Text className="text-sm font-bold text-gray-900 dark:text-dark-text">{formatCLP(c.amount)}</Text>
                    </TouchableOpacity>
                  )
                })
              )}

              {debt!.hasOverdue && (
                <View className="bg-coral-fuego/10 border border-coral-fuego/30 rounded-xl p-3">
                  <Text className="text-xs text-gray-700 dark:text-dark-text">
                    Tienes {debt!.overdue.length === 1 ? 'un mes vencido' : `${debt!.overdue.length} meses vencidos`}.
                    Tu cupo sigue siendo tuyo, pero tu QR de acceso no funciona hasta que te pongas al día.
                  </Text>
                </View>
              )}

              {debt!.totalInReview > 0 && (
                <Text className="text-xs text-gray-500 dark:text-dark-text2">
                  {formatCLP(debt!.totalInReview)} esperando revisión del profesor.
                </Text>
              )}

              {nothingToPay ? (
                <Text className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Estás al día. No hay mensualidades pendientes.
                </Text>
              ) : (
                <Text className="text-xs text-gray-500 dark:text-dark-text2">
                  Puedes pagar varios meses con una sola transferencia: marca los que quieras saldar.
                </Text>
              )}
            </View>
          )}

          {/* Precio de la clase — lo que recibe el profesor con cualquier método */}
          {isMyTurnToPay && !nothingToPay && (
            <View className="bg-brand-50 dark:bg-brand-950/30 rounded-2xl p-5 border border-brand-100 dark:border-brand-900/50">
              <Text className="text-brand-700 dark:text-brand-300 font-medium text-sm mb-1">
                {debtMode
                  ? selectedCharges.length === 1 ? 'Mensualidad seleccionada' : `${selectedCharges.length} mensualidades seleccionadas`
                  : 'Precio de la clase'}
              </Text>
              <Text className="text-4xl font-bold text-brand-900 dark:text-brand-200">{formatCLP(amount)}</Text>
              {debtMode && selectedCharges.length > 0 && (
                <Text className="text-xs text-brand-600 dark:text-brand-400 mt-1">
                  {selectedCharges.map((c) => formatBillingPeriod(c.billing_period)).join(' · ')}
                </Text>
              )}
              {is2x && <Text className="text-xs text-brand-600 dark:text-brand-400 mt-1">Precio 2x — cubre a ambos</Text>}
              {showMp && showTransfer && (
                <Text className="text-xs text-brand-700 dark:text-brand-300 mt-2">
                  Elige cómo pagar más abajo. El monto final varía según el método.
                </Text>
              )}
            </View>
          )}

          {/* Opción Mercado Pago (in-app con split) */}
          {showMp && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
              <View className="flex-row items-center gap-2">
                <CreditCard size={18} stroke="#009EE3" />
                <Text className="font-bold text-gray-900 dark:text-dark-text">Pagar con Mercado Pago</Text>
              </View>
              <Text className="text-xs text-gray-500 dark:text-dark-text2">
                Paga al instante con tarjeta, débito o saldo. Tu inscripción se confirma automáticamente al aprobarse el pago.
              </Text>

              <View className="gap-0.5 border-t border-gray-100 dark:border-dark-border pt-2">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600 dark:text-dark-text2">Clase</Text>
                  <Text className="text-xs text-gray-600 dark:text-dark-text2">{formatCLP(mpBreakdown.base)}</Text>
                </View>
                {mpBreakdown.commission > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-600 dark:text-dark-text2">Comisión de servicio DanzClass</Text>
                    <Text className="text-xs text-gray-600 dark:text-dark-text2">{formatCLP(mpBreakdown.commission)}</Text>
                  </View>
                )}
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600 dark:text-dark-text2">Costo de procesamiento Mercado Pago</Text>
                  <Text className="text-xs text-gray-600 dark:text-dark-text2">{formatCLP(mpBreakdown.mpFeeCovered)}</Text>
                </View>
                <View className="flex-row justify-between pt-1">
                  <Text className="text-xs font-bold text-gray-900 dark:text-dark-text">Total</Text>
                  <Text className="text-xs font-bold text-gray-900 dark:text-dark-text">{formatCLP(mpBreakdown.total)}</Text>
                </View>
                {/* El upsell "con un plan no pagas la comisión" se quitó el
                    2026-09-04: durante el lanzamiento gratuito toda cuenta es
                    Pro y la comisión de servicio la paga cualquier alumno que
                    pague por Mercado Pago. Espejo del mismo cambio en web. */}
              </View>

              <TouchableOpacity
                onPress={handleMpPay}
                disabled={mpLoading}
                className={`rounded-2xl py-4 items-center ${mpLoading ? 'bg-gray-300' : ''}`}
                style={mpLoading ? undefined : { backgroundColor: '#009EE3' }}
              >
                <Text className="text-white font-bold text-base">
                  {mpLoading ? 'Redirigiendo...' : `Pagar ${formatCLP(mpBreakdown.total)} con Mercado Pago`}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Divisor si hay MP arriba */}
          {showTransfer && showMp && (
            <View className="flex-row items-center gap-2">
              <View className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
              <Text className="text-xs text-gray-400 dark:text-dark-text2">o transfiere directo</Text>
              <View className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
            </View>
          )}

          {/* Monto exacto a transferir — sin cargos adicionales */}
          {showTransfer && (
            <View className="bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl p-4 flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-2 flex-1">
                <Building2 size={18} stroke="#059669" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">Transferir al profesor</Text>
                  <Text className="text-xs text-gray-600 dark:text-dark-text2">Sin cargos adicionales. El profesor confirma tu pago.</Text>
                </View>
              </View>
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{formatCLP(amount)}</Text>
            </View>
          )}

          {/* Bank details */}
          {showTransfer && paymentInfo && (
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

          {showTransfer && !paymentInfo && (
            <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border items-center">
              <Text className="text-sm text-gray-500 dark:text-dark-text2">El profesor aún no configuró sus datos bancarios.</Text>
            </View>
          )}

          {/* Receipt upload — solo transferencia */}
          {showTransfer && (
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
          {showTransfer && !alreadySubmitted && (
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

          {/* La clase acepta MP pero el profesor no conectó su cuenta, y no
              acepta transferencia: no queda ninguna vía de pago disponible. */}
          {noMethodAvailable && (
            <View className="bg-coral-fuego/10 border border-coral-fuego/30 rounded-2xl p-4">
              <Text className="text-sm text-gray-700 dark:text-dark-text">
                Esta clase no tiene ninguna forma de pago disponible en este momento
                {acceptsMp && !teacherMpConnected ? ' (el profesor todavía no habilitó el pago con Mercado Pago)' : ''}.
                Contacta al profesor o vuelve más tarde.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
