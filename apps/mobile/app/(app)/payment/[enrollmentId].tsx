import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import Clipboard from '@react-native-clipboard/clipboard'
import { supabase } from '../../../lib/supabase'
import { formatCLP } from '@danceclass/shared'

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
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('enrollments')
        .select('*, class:classes(*, teacher:profiles!teacher_id(*, payment_info:teacher_payment_info(*)))')
        .eq('id', enrollmentId)
        .single()
      setEnrollment(data)
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

  async function submitPayment() {
    if (!receipt) return
    setUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = receipt.split('.').pop() ?? 'jpg'
    const fileName = `${user.id}/${enrollmentId}.${ext}`
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

    const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(uploadData.path)

    await supabase.from('payments').insert({
      enrollment_id: enrollmentId,
      amount: enrollment.class.price,
      receipt_url: urlData.publicUrl,
      status: 'pending',
    })

    await supabase.from('enrollments').update({ status: 'payment_submitted' }).eq('id', enrollmentId)

    setSuccess(true)
    setUploading(false)
    setTimeout(() => router.back(), 2000)
  }

  if (loading) return <SafeAreaView className="flex-1 items-center justify-center"><ActivityIndicator color="#c026d3" /></SafeAreaView>
  if (!enrollment) return null

  const cls = enrollment.class
  const paymentInfo = cls.teacher?.payment_info?.[0] ?? cls.teacher?.payment_info

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-6xl mb-4">✅</Text>
        <Text className="text-xl font-bold text-gray-900">¡Comprobante enviado!</Text>
        <Text className="text-sm text-gray-500 text-center mt-2">El profesor verificará tu pago pronto</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        <View className="bg-white px-4 py-4 border-b border-gray-100 flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-brand-600 text-base">‹ Volver</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">Pagar clase</Text>
        </View>

        <View className="p-4 gap-4">
          {/* Amount */}
          <View className="bg-brand-50 rounded-2xl p-5 border border-brand-100">
            <Text className="text-brand-700 font-medium text-sm mb-1">Monto a transferir</Text>
            <Text className="text-4xl font-bold text-brand-900">{formatCLP(cls.price)}</Text>
          </View>

          {/* Bank details */}
          {paymentInfo && (
            <View className="bg-white rounded-2xl p-4 border border-gray-100 gap-3">
              <Text className="font-bold text-gray-900">Datos de transferencia</Text>
              {[
                { label: 'Banco', value: paymentInfo.bank_name },
                { label: 'Tipo', value: ACCOUNT_TYPE_LABELS[paymentInfo.account_type] },
                { label: 'N° Cuenta', value: paymentInfo.account_number },
                { label: 'RUT', value: paymentInfo.rut },
                { label: 'Titular', value: paymentInfo.account_holder_name },
                { label: 'Email', value: paymentInfo.email },
              ].map(({ label, value }) => (
                <TouchableOpacity
                  key={label}
                  onLongPress={() => {
                    Clipboard.setString(value)
                    Alert.alert('Copiado', `${label} copiado`)
                  }}
                  className="flex-row justify-between"
                >
                  <Text className="text-xs text-gray-500">{label}</Text>
                  <Text className="text-sm font-medium text-gray-900">{value}</Text>
                </TouchableOpacity>
              ))}
              <Text className="text-xs text-gray-400 text-center">Mantén presionado para copiar</Text>
            </View>
          )}

          {/* Receipt upload */}
          <View className="bg-white rounded-2xl p-4 border border-gray-100 gap-3">
            <Text className="font-bold text-gray-900">Comprobante de pago</Text>

            {receipt ? (
              <View className="gap-2">
                <Image source={{ uri: receipt }} className="w-full h-48 rounded-xl" resizeMode="contain" />
                <TouchableOpacity onPress={pickReceipt} className="items-center">
                  <Text className="text-brand-600 text-sm font-medium">Cambiar imagen</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickReceipt}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 items-center gap-2"
              >
                <Text className="text-4xl">📎</Text>
                <Text className="text-sm font-medium text-gray-700">Seleccionar comprobante</Text>
                <Text className="text-xs text-gray-400">JPG o PNG</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={submitPayment}
            disabled={!receipt || uploading}
            className={`rounded-2xl py-4 items-center ${receipt && !uploading ? 'bg-brand-600' : 'bg-gray-300'}`}
          >
            <Text className="text-white font-bold text-base">
              {uploading ? 'Enviando...' : 'Enviar comprobante'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
