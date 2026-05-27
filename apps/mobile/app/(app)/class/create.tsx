import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, X, ImagePlus, AlertCircle } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { sendNotifications } from '../../../lib/notifications'
import {
  DANCE_STYLES, DAYS_OF_WEEK, canTeachUnlimited, canUploadVideo,
} from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'
import MobileSelect from '../../../components/ui/MobileSelect'
import MobileDateInput from '../../../components/ui/MobileDateInput'
import MobileCityPicker from '../../../components/ui/MobileCityPicker'
import MobileMonthCalendar from '../../../components/ui/MobileMonthCalendar'

type MediaItem = { uri: string; type: 'image' | 'video'; mimeType: string; fileName: string }

const LEVEL_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
]
const CLASS_TYPE_OPTIONS = [
  { value: 'coreografía', label: 'Coreografía' },
  { value: 'freestyle', label: 'Freestyle' },
  { value: 'otro', label: 'Otro' },
]
const RECURRENCE_OPTIONS = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'custom', label: 'Fechas personalizadas' },
]
const DAY_OPTIONS = DAYS_OF_WEEK.map((d, i) => ({ value: String(i), label: d }))
const STYLE_OPTIONS = DANCE_STYLES.map((s) => ({ value: s, label: s }))

export default function CreateClassScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>()

  const classType = (typeParam as 'suelta' | 'periodica' | 'entrenamiento') ?? 'suelta'
  const isPeriodic = classType === 'periodica' || classType === 'entrenamiento'
  const isEntrenamiento = classType === 'entrenamiento'

  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [hasPaymentInfo, setHasPaymentInfo] = useState(true)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [danceStyle, setDanceStyle] = useState('')
  const [classTypeVal, setClassTypeVal] = useState('')
  const [level, setLevel] = useState('todos')
  const [date, setDate] = useState('') // YYYY-MM-DD
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [recurringTime, setRecurringTime] = useState('')
  const [customDates, setCustomDates] = useState<string[]>([])
  const [endsAt, setEndsAt] = useState('')
  const [endsIndefinitely, setEndsIndefinitely] = useState(false)
  const [requiresAudition, setRequiresAudition] = useState(false)
  const [billingDay, setBillingDay] = useState('1')
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [city, setCity] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [maxSpots, setMaxSpots] = useState('15')
  const [price, setPrice] = useState('')
  const [priceSuelta, setPriceSuelta] = useState('')
  const [price2x, setPrice2x] = useState('')
  const [priceSuelta2x, setPriceSuelta2x] = useState('')
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  const unlimited = canTeachUnlimited(tier)
  const mediaLimit = tier === 'basic' ? 1 : 5

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setTeacherId(user.id)

      const [subRes, payRes] = await Promise.all([
        supabase.from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').single(),
        supabase.from('teacher_payment_info').select('id').eq('teacher_id', user.id).maybeSingle(),
      ])
      setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
      setHasPaymentInfo(!!payRes.data)
    }
    load()
  }, [])

  async function pickMedia() {
    if (mediaItems.length >= mediaLimit) {
      Alert.alert('Límite', `Puedes subir máximo ${mediaLimit} archivo${mediaLimit > 1 ? 's' : ''}`)
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitas dar acceso a tu galería para seleccionar archivos.')
      return
    }
    if (permission.accessPrivileges === 'limited') {
      Alert.alert(
        'Acceso limitado a Fotos',
        'Para seleccionar archivos ve a Configuración > Expo Go > Fotos y elige "Acceso completo".',
        [{ text: 'OK' }]
      )
      return
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: canUploadVideo(tier) ? ['images', 'videos'] : ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const isVideo = asset.type === 'video'
      if (isVideo && !canUploadVideo(tier)) {
        Alert.alert('Plan insuficiente', 'Tu plan no permite subir videos en clases.')
        return
      }
      if (mediaItems.length >= mediaLimit) return
      setMediaItems((prev) => [...prev, {
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        fileName: asset.fileName ?? `media_${Date.now()}`,
      }])
    } catch {
      Alert.alert('Error de acceso', 'No se pudo abrir la galería. Ve a Configuración > Expo Go > Fotos y elige "Acceso completo".')
    }
  }

  function removeMedia(index: number) {
    setMediaItems((prev) => prev.filter((_, i) => i !== index))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    const today = new Date().toISOString().split('T')[0]

    if (!title.trim() || title.length < 3) errs.title = 'Mínimo 3 caracteres'

    if (classType === 'suelta') {
      if (!date) errs.date = 'Requerido'
      else if (date < today) errs.date = 'La fecha no puede ser en el pasado'
      if (!time) errs.time = 'Requerido'
    } else {
      if (!recurrence) errs.recurrence = 'Requerido'
      if (!recurringTime) errs.recurringTime = 'Requerido'
      if (recurrence && recurrence !== 'custom' && !dayOfWeek) errs.dayOfWeek = 'Requerido'
      if (recurrence === 'custom' && customDates.length === 0) errs.customDates = 'Selecciona al menos una fecha'
      else if (recurrence === 'custom') {
        const invalid = customDates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T00:00:00').getTime()))
        if (invalid) errs.customDates = `Fecha inválida: ${invalid}`
      }
      if (classType === 'periodica' && !endsAt) errs.endsAt = 'Las clases periódicas requieren fecha de término'
      if (isEntrenamiento && !endsAt && !endsIndefinitely) errs.endsAt = 'Indica fecha de término o marca Indefinido'
      if (endsAt && endsAt < today) errs.endsAt = 'La fecha de término no puede ser en el pasado'
    }

    if (!price) errs.price = 'Requerido'
    if (!maxSpots || Number(maxSpots) < 1) errs.maxSpots = 'Mínimo 1 cupo'

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!teacherId) return
    if (!validate()) return

    setSubmitting(true)
    setGlobalError(null)

    const { data: classRecord, error: classError } = await supabase
      .from('classes')
      .insert({
        teacher_id: teacherId,
        title: title.trim(),
        description: description.trim() || null,
        type: classType,
        dance_style: danceStyle || null,
        class_type: classTypeVal || null,
        level,
        date: classType === 'suelta' ? date : null,
        time: classType === 'suelta' ? time : null,
        recurrence: isPeriodic ? recurrence : null,
        day_of_week: (isPeriodic && recurrence !== 'custom' && dayOfWeek !== '') ? Number(dayOfWeek) : null,
        recurring_time: isPeriodic ? recurringTime : null,
        custom_dates: (isPeriodic && recurrence === 'custom') ? customDates : [],
        duration_minutes: Number(durationMinutes) || 60,
        location_name: locationName.trim() || null,
        location_address: locationAddress.trim() || null,
        city: city.trim() || null,
        max_spots: Number(maxSpots),
        price: Number(price),
        price_suelta: (classType === 'periodica' && priceSuelta) ? Number(priceSuelta) : null,
        price_2x: price2x ? Number(price2x) : null,
        price_suelta_2x: (classType === 'periodica' && priceSuelta2x) ? Number(priceSuelta2x) : null,
        ends_at: (isPeriodic && !endsIndefinitely) ? (endsAt || null) : null,
        ends_indefinitely: isEntrenamiento ? endsIndefinitely : false,
        requires_audition: isEntrenamiento ? requiresAudition : false,
        billing_day: isEntrenamiento ? (Number(billingDay) || 1) : null,
        audition_closed: false,
        status: 'active',
      } as any)
      .select()
      .single()

    if (classError || !classRecord) {
      setGlobalError('Error al crear la clase. Intenta de nuevo.')
      setSubmitting(false)
      return
    }

    // Upload media
    let mediaError = false
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i]
      try {
        const ext = item.fileName.split('.').pop() ?? (item.type === 'video' ? 'mp4' : 'jpg')
        const path = `${classRecord.id}/${i}.${ext}`

        const response = await fetch(item.uri)
        const blob = await response.blob()

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('class-media')
          .upload(path, blob, { contentType: item.mimeType })

        if (uploadErr || !uploadData) { mediaError = true; continue }

        const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
        await supabase.from('class_media').insert({
          class_id: classRecord.id,
          type: item.type,
          url: urlData.publicUrl,
          order_index: i,
        })
      } catch {
        mediaError = true
      }
    }

    // Notify followers
    const { data: followers } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', teacherId)

    if (followers && followers.length > 0) {
      await sendNotifications(
        followers.map((f) => ({
          user_id: f.follower_id,
          type: 'new_class',
          data: { class_id: classRecord.id, class_title: title.trim() },
        }))
      )
    }

    if (mediaError) setGlobalError('Clase creada, pero hubo un error al subir algunos archivos.')

    setSubmitting(false)
    router.replace(`/(app)/class/${classRecord.id}` as any)
  }

  const typeLabel = classType === 'suelta' ? 'Clase suelta' : classType === 'periodica' ? 'Periódica' : 'Entrenamiento'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Publicar clase</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* Type badge */}
        <View className="flex-row">
          <View className="bg-brand-50 border border-brand-200 rounded-full px-3 py-1">
            <Text className="text-xs font-semibold text-brand-700">{typeLabel}</Text>
          </View>
        </View>

        {/* No payment info warning */}
        {!hasPaymentInfo && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex-row gap-2">
            <AlertCircle size={16} stroke="#ca8a04" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-yellow-800">Configura tus datos bancarios</Text>
              <Text className="text-xs text-yellow-700 mt-0.5">Los estudiantes los necesitan para pagarte.</Text>
            </View>
          </View>
        )}

        {globalError && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3">
            <Text className="text-sm text-red-700">{globalError}</Text>
          </View>
        )}

        {/* Title */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Título *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="ej: Clases de Salsa — Nivel básico"
            placeholderTextColor="#9CA3AF"
            maxLength={80}
            className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.title ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
          />
          {errors.title && <Text className="text-xs text-red-600">{errors.title}</Text>}
        </View>

        {/* Description */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Descripción</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe la clase, qué aprenderán, requisitos..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
            className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            style={{ minHeight: 90 }}
          />
        </View>

        {/* Style + Level */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <MobileSelect
              label="Estilo"
              value={danceStyle}
              options={STYLE_OPTIONS}
              onSelect={setDanceStyle}
              nullable
            />
          </View>
          <View className="flex-1">
            <MobileSelect
              label="Nivel"
              value={level}
              options={LEVEL_OPTIONS}
              onSelect={setLevel}
            />
          </View>
        </View>

        {/* Category (optional, not for entrenamiento) */}
        {!isEntrenamiento && (
          <MobileSelect
            label="Categoría (opcional)"
            value={classTypeVal}
            options={CLASS_TYPE_OPTIONS}
            onSelect={setClassTypeVal}
            nullable
          />
        )}

        {/* Date/time for suelta */}
        {classType === 'suelta' && (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <MobileDateInput
                label="Fecha *"
                value={date}
                onChange={setDate}
                error={errors.date}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Hora * (HH:MM)</Text>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="19:00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={5}
                className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.time ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
              />
              {errors.time && <Text className="text-xs text-red-600 mt-1">{errors.time}</Text>}
            </View>
          </View>
        )}

        {/* Schedule for periodic/entrenamiento */}
        {isPeriodic && (
          <View className="gap-3">
            <MobileSelect
              label="Periodicidad *"
              value={recurrence}
              options={RECURRENCE_OPTIONS}
              onSelect={setRecurrence}
              error={errors.recurrence}
            />
            {recurrence === 'biweekly' && (
              <Text className="-mt-2 text-xs text-gray-500 dark:text-dark-text2">Quincenal = cada 14 días desde la fecha de inicio.</Text>
            )}

            {recurrence && recurrence !== 'custom' && (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <MobileSelect
                    label="Día *"
                    value={dayOfWeek}
                    options={DAY_OPTIONS}
                    onSelect={setDayOfWeek}
                    error={errors.dayOfWeek}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Hora * (HH:MM)</Text>
                  <TextInput
                    value={recurringTime}
                    onChangeText={setRecurringTime}
                    placeholder="19:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={5}
                    className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.recurringTime ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
                  />
                  {errors.recurringTime && <Text className="text-xs text-red-600 mt-1">{errors.recurringTime}</Text>}
                </View>
              </View>
            )}

            {recurrence === 'custom' && (
              <View className="gap-3">
                <MobileMonthCalendar selected={customDates} onChange={setCustomDates} disablePast />
                {errors.customDates && <Text className="text-xs text-red-600">{errors.customDates}</Text>}
                <View>
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Hora de inicio * (HH:MM)</Text>
                  <TextInput
                    value={recurringTime}
                    onChangeText={setRecurringTime}
                    placeholder="19:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={5}
                    className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.recurringTime ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
                  />
                  {errors.recurringTime && <Text className="text-xs text-red-600 mt-1">{errors.recurringTime}</Text>}
                </View>
              </View>
            )}

            {/* End date */}
            <View className="border border-gray-200 dark:border-dark-border rounded-xl p-3 gap-2 bg-white dark:bg-dark-surface">
              <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Fecha de término *</Text>
              {!endsIndefinitely && (
                <MobileDateInput
                  value={endsAt}
                  onChange={setEndsAt}
                  error={errors.endsAt}
                />
              )}
              {isEntrenamiento && (
                <TouchableOpacity
                  onPress={() => {
                    setEndsIndefinitely(!endsIndefinitely)
                    if (!endsIndefinitely) setEndsAt('')
                  }}
                  className="flex-row items-center gap-2"
                >
                  <View className={`w-5 h-5 rounded border-2 items-center justify-center ${endsIndefinitely ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white'}`}>
                    {endsIndefinitely && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text className="text-sm text-gray-700 dark:text-dark-text2">Indefinido</Text>
                  {endsIndefinitely && (
                    <Text className="text-xs text-amber-600 flex-1">Avisa a tus alumnos cuándo dejar de pagar</Text>
                  )}
                </TouchableOpacity>
              )}
              {!isEntrenamiento && (
                <View className="flex-row items-center gap-2 opacity-40">
                  <View className="w-5 h-5 rounded border-2 border-gray-300 bg-white" />
                  <Text className="text-sm text-gray-400 line-through">Indefinido</Text>
                  <Text className="text-xs text-gray-400">(solo para Entrenamiento)</Text>
                </View>
              )}
            </View>

            {/* Price suelta for periodica */}
            {classType === 'periodica' && (
              <View className="border border-gray-200 dark:border-dark-border rounded-xl p-3 gap-2 bg-white dark:bg-dark-surface">
                <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
                  Precio clase suelta <Text className="text-gray-400 font-normal">(opcional)</Text>
                </Text>
                <Text className="text-xs text-gray-400">Si los alumnos también pueden pagar solo una clase</Text>
                <TextInput
                  value={priceSuelta}
                  onChangeText={setPriceSuelta}
                  placeholder="ej: 5000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50"
                />
                <Text className="text-sm font-medium text-gray-700 mt-1">
                  Precio 2x clase suelta <Text className="text-gray-400 font-normal">(opcional)</Text>
                </Text>
                <TextInput
                  value={priceSuelta2x}
                  onChangeText={setPriceSuelta2x}
                  placeholder="ej: 8000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50"
                />
              </View>
            )}

            {/* Audition toggle for entrenamiento */}
            {isEntrenamiento && (
              <View className="border border-brand-200 bg-brand-50/40 rounded-xl p-3 gap-2">
                <TouchableOpacity
                  onPress={() => setRequiresAudition(!requiresAudition)}
                  className="flex-row items-center gap-2"
                >
                  <View className={`w-5 h-5 rounded border-2 items-center justify-center ${requiresAudition ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white'}`}>
                    {requiresAudition && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text className="text-sm font-medium text-gray-800 dark:text-dark-text">Requiere postulación</Text>
                </TouchableOpacity>
                {requiresAudition && (
                  <Text className="text-xs text-brand-700">
                    Los interesados completarán un formulario. Podrás aceptar o rechazar desde el panel.
                  </Text>
                )}
              </View>
            )}

            {/* Billing day for entrenamiento */}
            {isEntrenamiento && (
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
                  Día de cobro mensual <Text className="text-gray-400 font-normal">(1–27)</Text>
                </Text>
                <TextInput
                  value={billingDay}
                  onChangeText={(v) => setBillingDay(v.replace(/[^0-9]/g, ''))}
                  placeholder="1"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 w-24"
                />
                <Text className="text-xs text-gray-400 dark:text-dark-text2/60">Los alumnos verán en qué día del mes se realiza el cobro.</Text>
              </View>
            )}
          </View>
        )}

        {/* Location */}
        <View className="gap-3">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Lugar</Text>
            <TextInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder="ej: Estudio Dance House"
              placeholderTextColor="#9CA3AF"
              className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Dirección</Text>
            <TextInput
              value={locationAddress}
              onChangeText={setLocationAddress}
              placeholder="ej: Av. Providencia 1234"
              placeholderTextColor="#9CA3AF"
              className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            />
          </View>
          <MobileCityPicker label="Ciudad" value={city} onChange={setCity} />
        </View>

        {/* Spots / Duration / Price */}
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Cupos *</Text>
            <TextInput
              value={maxSpots}
              onChangeText={setMaxSpots}
              placeholder="15"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.maxSpots ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
            />
            {errors.maxSpots && <Text className="text-xs text-red-600">{errors.maxSpots}</Text>}
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Duración (min)</Text>
            <TextInput
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              placeholder="60"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">{isPeriodic ? 'Precio/mes *' : 'Precio *'}</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="15000"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.price ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
            />
            {errors.price && <Text className="text-xs text-red-600">{errors.price}</Text>}
          </View>
        </View>

        {/* Price 2x */}
        <View className="border border-brand-100 bg-brand-50/30 rounded-xl p-3 gap-1">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
            Precio 2x <Text className="text-gray-400 font-normal">(opcional)</Text>
          </Text>
          <Text className="text-xs text-gray-400">
            {classType === 'suelta'
              ? 'Precio total cuando dos alumnos pagan juntos'
              : 'Precio mensual total para dos alumnos'}
          </Text>
          <TextInput
            value={price2x}
            onChangeText={setPrice2x}
            placeholder="ej: 18000"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white mt-1"
          />
        </View>

        {/* Media */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
            {tier === 'basic' ? 'Foto o Video' : 'Fotos/Videos'}{' '}
            <Text className="text-gray-400 font-normal">(máx. {mediaLimit})</Text>
          </Text>
          {mediaItems.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {mediaItems.map((item, i) => (
                <View key={i} style={{ width: 90, height: 90 }} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
                  <Image source={{ uri: item.uri }} style={{ width: 90, height: 90 }} />
                  <TouchableOpacity
                    onPress={() => removeMedia(i)}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                  >
                    <X size={12} stroke="white" />
                  </TouchableOpacity>
                  {item.type === 'video' && (
                    <View className="absolute bottom-1 left-1 bg-black/50 rounded px-1">
                      <Text className="text-white text-xs">Video</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {mediaItems.length < mediaLimit && (
            <TouchableOpacity
              onPress={pickMedia}
              className="border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl p-6 items-center gap-2"
            >
              <ImagePlus size={24} stroke="#9CA3AF" />
              <Text className="text-sm text-gray-500 dark:text-dark-text2">Seleccionar foto o video</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          className="bg-brand-600 rounded-xl py-3.5 items-center mt-2 mb-4"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">Publicar clase</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
