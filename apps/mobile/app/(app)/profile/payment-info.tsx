import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, CheckCircle2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { supabase } from '../../../lib/supabase'
import { CHILEAN_BANKS } from '@danceclass/shared'
import MobileSelect from '../../../components/ui/MobileSelect'

const BANK_OPTIONS = (CHILEAN_BANKS as readonly string[]).map((b) => ({ value: b, label: b }))
const ACCOUNT_TYPE_OPTIONS = [
  { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
  { value: 'cuenta_vista', label: 'Cuenta Vista' },
  { value: 'cuenta_rut', label: 'Cuenta RUT' },
  { value: 'cuenta_ahorro', label: 'Cuenta Ahorro' },
]

export default function PaymentInfoScreen() {
  const router = useRouter()
  const { isDark } = useTheme()

  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [bankName, setBankName] = useState('')
  const [accountType, setAccountType] = useState('cuenta_corriente')
  const [accountNumber, setAccountNumber] = useState('')
  const [rut, setRut] = useState('')
  const [holderName, setHolderName] = useState('')
  const [email, setEmail] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setTeacherId(user.id)

      const { data } = await supabase
        .from('teacher_payment_info')
        .select('*')
        .eq('teacher_id', user.id)
        .maybeSingle()

      if (data) {
        setExistingId(data.id)
        setBankName(data.bank_name ?? '')
        setAccountType(data.account_type ?? 'cuenta_corriente')
        setAccountNumber(data.account_number ?? '')
        setRut(data.rut ?? '')
        setHolderName(data.account_holder_name ?? '')
        setEmail(data.email ?? '')
      }
      setLoading(false)
    }
    load()
  }, [])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!bankName) errs.bankName = 'Selecciona un banco'
    if (!accountNumber.trim() || accountNumber.length < 4) errs.accountNumber = 'Ingresa el número de cuenta'
    if (!rut.trim() || rut.length < 8) errs.rut = 'RUT inválido'
    if (!holderName.trim() || holderName.length < 2) errs.holderName = 'Ingresa el titular'
    if (!email.trim() || !email.includes('@')) errs.email = 'Email inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!teacherId) return
    if (!validate()) return
    setSaving(true)

    const payload = {
      bank_name: bankName,
      account_type: accountType,
      account_number: accountNumber.trim(),
      rut: rut.trim(),
      account_holder_name: holderName.trim(),
      email: email.trim(),
    }

    if (existingId) {
      await supabase.from('teacher_payment_info').update(payload).eq('id', existingId)
    } else {
      const { data } = await supabase
        .from('teacher_payment_info')
        .insert({ ...payload, teacher_id: teacherId })
        .select('id')
        .single()
      if (data) setExistingId(data.id)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.back() }, 1500)
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Datos Transferencia</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-sm text-gray-500 dark:text-dark-text2">Los estudiantes usarán estos datos para transferirte</Text>

        {saved && (
          <View className="bg-green-50 border border-green-200 rounded-xl p-3 flex-row items-center gap-2">
            <CheckCircle2 size={18} stroke="#16a34a" />
            <Text className="text-sm font-medium text-green-700">Guardado correctamente</Text>
          </View>
        )}

        <MobileSelect
          label="Banco *"
          value={bankName}
          options={BANK_OPTIONS}
          onSelect={setBankName}
          placeholder="Seleccionar banco"
          error={errors.bankName}
        />

        <MobileSelect
          label="Tipo de cuenta *"
          value={accountType}
          options={ACCOUNT_TYPE_OPTIONS}
          onSelect={setAccountType}
        />

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Número de cuenta *</Text>
          <TextInput
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="000000000"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.accountNumber ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
          />
          {errors.accountNumber && <Text className="text-xs text-red-600">{errors.accountNumber}</Text>}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">RUT *</Text>
          <TextInput
            value={rut}
            onChangeText={setRut}
            placeholder="12.345.678-9"
            placeholderTextColor="#9CA3AF"
            className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.rut ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
          />
          {errors.rut && <Text className="text-xs text-red-600">{errors.rut}</Text>}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Nombre titular *</Text>
          <TextInput
            value={holderName}
            onChangeText={setHolderName}
            placeholder="Nombre completo del titular"
            placeholderTextColor="#9CA3AF"
            className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.holderName ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
          />
          {errors.holderName && <Text className="text-xs text-red-600">{errors.holderName}</Text>}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Email para transferencia *</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.email ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
          />
          {errors.email && <Text className="text-xs text-red-600">{errors.email}</Text>}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || saved}
          className="bg-brand-600 rounded-xl py-3.5 items-center mb-4"
          style={{ opacity: saving || saved ? 0.6 : 1 }}
        >
          {saving
            ? <ActivityIndicator color="white" />
            : <Text className="text-white font-semibold text-base">Guardar datos de transferencia</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
