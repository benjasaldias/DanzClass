import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { CreditCard, Building2, AlertCircle } from 'lucide-react-native'
import { formatCLP, paymentBreakdown } from '@danceclass/shared'

interface PaymentMethodsFieldProps {
  acceptsMp: boolean
  acceptsTransfer: boolean
  onChangeMp: (value: boolean) => void
  onChangeTransfer: (value: boolean) => void
  /** El profesor conectó su cuenta de Mercado Pago (profiles.mp_connected). */
  mpConnected: boolean
  /** El profesor cargó sus datos bancarios (teacher_payment_info). */
  hasPaymentInfo: boolean
  /** Precio principal de la clase (mensual en periódica/entrenamiento). */
  price?: number
  priceLabel: string
  price2x?: number
  priceSuelta?: number
  /** Precio 2x de una sesión suelta dentro de una periódica, si aplica. */
  priceSuelta2x?: number
  error?: string
}

/** Cuánto paga el alumno por cada vía habilitada, para un monto dado. */
function PricePreview({
  label,
  amount,
  showMp,
  showTransfer,
}: {
  label: string
  amount: number
  showMp: boolean
  showTransfer: boolean
}) {
  // El profesor recibe `amount` íntegro en las dos vías — invariante del modelo.
  const noPlan = paymentBreakdown(amount, 'none', 'mp')
  const withPlan = paymentBreakdown(amount, 'pro', 'mp')

  return (
    <View className="gap-0.5">
      <Text className="text-xs font-medium text-gray-700 dark:text-dark-text2">
        {label}: recibes <Text className="font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(amount)}</Text>
      </Text>
      {showTransfer && (
        <Text className="text-xs text-gray-500 dark:text-dark-text2 pl-3">
          · Por transferencia el alumno paga <Text className="font-bold">{formatCLP(amount)}</Text>
        </Text>
      )}
      {showMp && (
        <Text className="text-xs text-gray-500 dark:text-dark-text2 pl-3">
          · Por Mercado Pago paga <Text className="font-bold">{formatCLP(withPlan.total)}</Text> con plan ·{' '}
          <Text className="font-bold">{formatCLP(noPlan.total)}</Text> sin plan
        </Text>
      )}
    </View>
  )
}

function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <View
      className={`w-5 h-5 rounded border-2 items-center justify-center ${
        checked ? 'bg-brand-600 border-brand-600' : 'border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface2'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {checked && <Text className="text-white text-xs font-bold">✓</Text>}
    </View>
  )
}

export default function PaymentMethodsField({
  acceptsMp,
  acceptsTransfer,
  onChangeMp,
  onChangeTransfer,
  mpConnected,
  hasPaymentInfo,
  price,
  priceLabel,
  price2x,
  priceSuelta,
  priceSuelta2x,
  error,
}: PaymentMethodsFieldProps) {
  const router = useRouter()
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0
  const showMpPreview = acceptsMp && mpConnected
  const showPreview = showMpPreview || acceptsTransfer

  return (
    <View className="rounded-xl border border-gray-200 dark:border-dark-border p-3 gap-3">
      <View>
        <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Cómo pueden pagarte *</Text>
        <Text className="text-xs text-gray-400 dark:text-dark-text2/60 mt-0.5">
          Elige al menos una vía. Recibes el 100% del precio que fijes en ambas.
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => mpConnected && onChangeMp(!acceptsMp)}
        disabled={!mpConnected}
        className={`flex-row items-start gap-2 ${mpConnected ? '' : 'opacity-60'}`}
      >
        <Checkbox checked={acceptsMp} disabled={!mpConnected} />
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <CreditCard size={16} stroke="#009EE3" />
            <Text className="text-sm font-medium text-gray-800 dark:text-dark-text">Mercado Pago (in-app)</Text>
          </View>
          <Text className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
            {mpConnected
              ? 'El alumno paga con tarjeta o saldo y su inscripción se confirma sola. El costo de procesamiento lo paga el alumno.'
              : 'Necesitas conectar tu cuenta de Mercado Pago para ofrecer esta vía.'}
          </Text>
        </View>
      </TouchableOpacity>

      {!mpConnected && (
        <TouchableOpacity onPress={() => router.push('/(app)/profile/payment-info' as any)} className="pl-7">
          <Text className="text-xs font-medium text-brand-600 dark:text-brand-300 underline">Conectar Mercado Pago</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => onChangeTransfer(!acceptsTransfer)} className="flex-row items-start gap-2">
        <Checkbox checked={acceptsTransfer} />
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Building2 size={16} stroke="#059669" />
            <Text className="text-sm font-medium text-gray-800 dark:text-dark-text">Transferencia bancaria</Text>
          </View>
          <Text className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
            El alumno te transfiere y sube el comprobante. Tú confirmas el pago. Sin cargos para nadie.
          </Text>
        </View>
      </TouchableOpacity>

      {acceptsTransfer && !hasPaymentInfo && (
        <View className="flex-row gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-2">
          <AlertCircle size={16} stroke="#ca8a04" />
          <Text className="text-xs text-yellow-700 dark:text-yellow-400 flex-1">
            Aún no cargaste tus datos bancarios: los alumnos no sabrán a qué cuenta transferir.
          </Text>
        </View>
      )}

      {!!error && <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>}

      {showPreview && validPrice && (
        <View className="rounded-lg bg-gray-50 dark:bg-dark-surface2/60 p-2.5 gap-2">
          <Text className="text-[11px] font-semibold uppercase text-gray-400 dark:text-dark-text2/60">
            Cómo lo verá el alumno
          </Text>
          <PricePreview label={priceLabel} amount={price!} showMp={showMpPreview} showTransfer={acceptsTransfer} />
          {typeof priceSuelta === 'number' && priceSuelta > 0 && (
            <PricePreview label="Clase suelta" amount={priceSuelta} showMp={showMpPreview} showTransfer={acceptsTransfer} />
          )}
          {typeof price2x === 'number' && price2x > 0 && (
            <PricePreview label="Precio 2x" amount={price2x} showMp={showMpPreview} showTransfer={acceptsTransfer} />
          )}
          {typeof priceSuelta2x === 'number' && priceSuelta2x > 0 && (
            <PricePreview label="Precio 2x (sesión suelta)" amount={priceSuelta2x} showMp={showMpPreview} showTransfer={acceptsTransfer} />
          )}
          {showMpPreview && (
            <Text className="text-[11px] text-gray-400 dark:text-dark-text2/60">
              La diferencia por Mercado Pago cubre el costo de procesamiento de la pasarela y, para alumnos sin plan,
              la comisión de servicio de DanzClass. Tú recibes siempre el precio que fijaste.
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
