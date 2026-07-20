import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, X, ImagePlus, Trash2 } from 'lucide-react-native'
import { supabase } from '../../../../lib/supabase'
import { sendNotifications } from '../../../../lib/notifications'
import { isCloudinaryConfigured, uploadVideoToCloudinary } from '../../../../lib/cloudinary'
import { DANCE_STYLES, DAYS_OF_WEEK } from '@danceclass/shared'
import MobileSelect from '../../../../components/ui/MobileSelect'
import MobileDateInput from '../../../../components/ui/MobileDateInput'
import MobileCityPicker from '../../../../components/ui/MobileCityPicker'
import MobileMonthCalendar from '../../../../components/ui/MobileMonthCalendar'
import AddressPicker from '../../../../components/ui/AddressPicker'
import { geocodeSearch } from '../../../../lib/location'
import { useTheme } from '../../../../context/ThemeContext'

type NewMediaItem = { uri: string; type: 'image' | 'video'; mimeType: string; fileName: string }
type ExistingMedia = { id: string; url: string; type: 'image' | 'video'; order_index: number }

const LEVEL_OPTIONS = [
  { value: 'todos', label: 'Todos los niveles' },
  { value: 'principiante', label: 'Básico' },
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

export default function EditClassScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [loading, setLoading] = useState(true)
  const [classData, setClassData] = useState<any>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [danceStyle, setDanceStyle] = useState('')
  const [classTypeVal, setClassTypeVal] = useState('')
  const [level, setLevel] = useState('todos')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [recurringTime, setRecurringTime] = useState('')
  const [customDates, setCustomDates] = useState<string[]>([])
  const [endsAt, setEndsAt] = useState('')
  const [endsIndefinitely, setEndsIndefinitely] = useState(false)
  const [billingDay, setBillingDay] = useState('1')
  const [allowLatePayment, setAllowLatePayment] = useState(true)
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [city, setCity] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [maxSpots, setMaxSpots] = useState('15')
  const [price, setPrice] = useState('')
  const [priceSuelta, setPriceSuelta] = useState('')
  const [price2x, setPrice2x] = useState('')
  const [priceSuelta2x, setPriceSuelta2x] = useState('')

  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>([])
  const [newMediaItems, setNewMediaItems] = useState<NewMediaItem[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      const { data } = await (supabase as any)
        .from('classes')
        .select('*, media:class_media(*)')
        .eq('id', id)
        .single()

      if (!data) { router.back(); return }
      setClassData(data)
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setDanceStyle(data.dance_style ?? '')
      setClassTypeVal(data.class_type ?? '')
      setLevel(data.level ?? 'todos')
      setDate(data.date ?? '')
      setTime(data.time ?? '')
      setRecurrence(data.recurrence ?? '')
      setDayOfWeek(data.day_of_week !== null && data.day_of_week !== undefined ? String(data.day_of_week) : '')
      setRecurringTime(data.recurring_time ?? '')
      setCustomDates(data.custom_dates ?? [])
      setEndsAt(data.ends_at ?? '')
      setEndsIndefinitely(data.ends_indefinitely ?? false)
      setBillingDay(data.billing_day ? String(data.billing_day) : '1')
      setAllowLatePayment(data.allow_late_payment ?? true)
      setLocationName(data.location_name ?? '')
      setLocationAddress(data.location_address ?? '')
      setCoords(data.latitude != null && data.longitude != null ? { lat: data.latitude, lng: data.longitude } : null)
      setCity(data.city ?? '')
      setDurationMinutes(String(data.duration_minutes ?? 60))
      setMaxSpots(String(data.max_spots ?? 15))
      setPrice(String(data.price ?? ''))
      setPriceSuelta(data.price_suelta ? String(data.price_suelta) : '')
      setPrice2x(data.price_2x ? String(data.price_2x) : '')
      setPriceSuelta2x(data.price_suelta_2x ? String(data.price_suelta_2x) : '')
      const media = [...(data.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
      setExistingMedia(media)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading || !classData) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  const classType = classData.type as 'suelta' | 'periodica' | 'entrenamiento'
  const isPeriodic = classType === 'periodica' || classType === 'entrenamiento'
  const isEntrenamiento = classType === 'entrenamiento'
  const totalMedia = existingMedia.length + newMediaItems.length
  const typeLabel = classType === 'suelta' ? 'Clase suelta' : classType === 'periodica' ? 'Periódica' : 'Entrenamiento'

  async function pickMedia() {
    if (totalMedia >= 5) { Alert.alert('Límite', 'Puedes subir máximo 5 archivos'); return }
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
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: false,
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const isVideo = asset.type === 'video'
      if (isVideo && (asset.fileSize ?? 0) > 200 * 1024 * 1024) {
        Alert.alert('Video muy pesado', 'El video supera los 200 MB. Comprímelo antes de subir.')
        return
      }
      if (!isVideo && (asset.fileSize ?? 0) > 10 * 1024 * 1024) {
        Alert.alert('Imagen muy pesada', 'La imagen supera los 10 MB.')
        return
      }
      setNewMediaItems((prev) => [...prev, {
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        fileName: asset.fileName ?? `media_${Date.now()}`,
      }])
    } catch {
      Alert.alert('Error de acceso', 'No se pudo abrir la galería. Ve a Configuración > Expo Go > Fotos y elige "Acceso completo".')
    }
  }

  async function removeExistingMedia(media: ExistingMedia) {
    // Vía API para borrar también el asset físico (video en Cloudinary / imagen
    // en el bucket), no solo la fila (item 10).
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      await fetch('https://dc-project-web.vercel.app/api/class/media-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ mediaId: media.id }),
      }).catch(() => {})
    } else {
      await supabase.from('class_media').delete().eq('id', media.id)
    }
    setExistingMedia((prev) => prev.filter((m) => m.id !== media.id))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!title.trim() || title.length < 3) errs.title = 'Mínimo 3 caracteres'
    if (classType === 'suelta') {
      if (!date) errs.date = 'Requerido'
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
      if (classType === 'periodica' && !endsAt) errs.endsAt = 'Requerido'
      if (isEntrenamiento && !endsAt && !endsIndefinitely) errs.endsAt = 'Indica fecha de término o Indefinido'
    }
    if (!price) errs.price = 'Requerido'
    if (!maxSpots || Number(maxSpots) < 1) errs.maxSpots = 'Mínimo 1 cupo'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    setGlobalError(null)

    // Re-geocode if the address changed and has no resolved coordinates.
    let resolvedCoords = coords
    const addr = locationAddress.trim()
    if (addr && !coords) {
      const res = await geocodeSearch(addr)
      if (res.length > 0) {
        resolvedCoords = { lat: res[0].lat, lng: res[0].lng }
      } else {
        setSubmitting(false)
        setGlobalError('No pudimos ubicar esa dirección en el mapa. Selecciona una sugerencia o revisa que sea válida en Chile.')
        return
      }
    }

    const { error: updateError } = await supabase
      .from('classes')
      .update({
        title: title.trim(),
        description: description.trim() || null,
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
        location_address: addr || null,
        latitude: resolvedCoords?.lat ?? null,
        longitude: resolvedCoords?.lng ?? null,
        city: city.trim() || null,
        max_spots: Number(maxSpots),
        price: Number(price),
        price_suelta: (classType === 'periodica' && priceSuelta) ? Number(priceSuelta) : null,
        price_2x: price2x ? Number(price2x) : null,
        price_suelta_2x: (classType === 'periodica' && priceSuelta2x) ? Number(priceSuelta2x) : null,
        ends_at: (isPeriodic && !endsIndefinitely) ? (endsAt || null) : null,
        ends_indefinitely: isEntrenamiento ? endsIndefinitely : false,
        billing_day: isEntrenamiento ? (Number(billingDay) || 1) : null,
        allow_late_payment: allowLatePayment,
      } as any)
      .eq('id', id)

    if (updateError) {
      setGlobalError('Error al guardar los cambios.')
      setSubmitting(false)
      return
    }

    // Upload new media
    const nextIndex = existingMedia.length
    for (let i = 0; i < newMediaItems.length; i++) {
      const item = newMediaItems[i]
      try {
        let mediaUrl: string
        if (item.type === 'video' && isCloudinaryConfigured()) {
          mediaUrl = await uploadVideoToCloudinary(item.uri, 'classes')
        } else {
          const ext = item.fileName.split('.').pop() ?? (item.type === 'video' ? 'mp4' : 'jpg')
          const path = `${id}/${nextIndex + i}.${ext}`
          const response = await fetch(item.uri)
          const blob = await response.blob()
          const { data: uploadData } = await supabase.storage.from('class-media').upload(path, blob, { contentType: item.mimeType })
          if (!uploadData) continue
          const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
          mediaUrl = urlData.publicUrl
        }
        await supabase.from('class_media').insert({ class_id: id, type: item.type, url: mediaUrl, order_index: nextIndex + i })
      } catch { continue }
    }

    // Notify enrolled students
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('class_id', id)
      .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])

    if (enrollments && enrollments.length > 0) {
      await sendNotifications(
        enrollments.map((e: any) => ({
          user_id: e.student_id,
          type: 'class_updated',
          data: { class_id: id, class_title: title.trim() },
        }))
      )
    }

    setSubmitting(false)
    router.back()
  }

  async function handleDelete() {
    Alert.alert(
      'Eliminar clase',
      `¿Eliminar "${classData.title}"? Todos los inscritos serán notificados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            const { data: enrollments } = await supabase
              .from('enrollments')
              .select('student_id')
              .eq('class_id', id)
              .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])

            if (enrollments && enrollments.length > 0) {
              await sendNotifications(
                enrollments.map((e: any) => ({
                  user_id: e.student_id,
                  type: 'class_cancelled',
                  data: { class_id: id, class_title: classData.title },
                }))
              )
            }
            await supabase.from('classes').update({ status: 'cancelled' } as any).eq('id', id)
            setDeleting(false)
            router.replace('/(app)/(tabs)/my-classes' as any)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Editar clase</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row">
          <View className="bg-gray-100 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border rounded-full px-3 py-1">
            <Text className="text-xs font-semibold text-gray-700 dark:text-dark-text2">{typeLabel}</Text>
          </View>
        </View>

        <Text className="text-xs text-gray-500 dark:text-dark-text2">Los inscritos serán notificados de los cambios</Text>

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
            <MobileSelect label="Estilo" value={danceStyle} options={STYLE_OPTIONS} onSelect={setDanceStyle} nullable />
          </View>
          <View className="flex-1">
            <MobileSelect label="Nivel" value={level} options={LEVEL_OPTIONS} onSelect={setLevel} />
          </View>
        </View>

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
              <MobileDateInput label="Fecha *" value={date} onChange={setDate} error={errors.date} />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Hora * (HH:MM)</Text>
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

        {/* Schedule for periodic */}
        {isPeriodic && (
          <View className="gap-3">
            <MobileSelect label="Periodicidad *" value={recurrence} options={RECURRENCE_OPTIONS} onSelect={setRecurrence} error={errors.recurrence} />
            {recurrence === 'biweekly' && (
              <Text className="-mt-2 text-xs text-gray-500 dark:text-dark-text2">Quincenal = cada 14 días desde la fecha de inicio.</Text>
            )}

            {recurrence && recurrence !== 'custom' && (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <MobileSelect label="Día *" value={dayOfWeek} options={DAY_OPTIONS} onSelect={setDayOfWeek} error={errors.dayOfWeek} />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Hora * (HH:MM)</Text>
                  <TextInput
                    value={recurringTime}
                    onChangeText={setRecurringTime}
                    placeholder="19:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={5}
                    className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.recurringTime ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
                  />
                </View>
              </View>
            )}

            {recurrence === 'custom' && (
              <View className="gap-3">
                <MobileMonthCalendar selected={customDates} onChange={setCustomDates} />
                {errors.customDates && <Text className="text-xs text-red-600">{errors.customDates}</Text>}
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Hora de inicio * (HH:MM)</Text>
                  <TextInput
                    value={recurringTime}
                    onChangeText={setRecurringTime}
                    placeholder="19:00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={5}
                    className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.recurringTime ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
                  />
                </View>
              </View>
            )}

            {/* End date */}
            <View className="border border-gray-200 dark:border-dark-border rounded-xl p-3 gap-2 bg-white dark:bg-dark-surface">
              <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Fecha de término *</Text>
              {!endsIndefinitely && (
                <MobileDateInput value={endsAt} onChange={setEndsAt} error={errors.endsAt} />
              )}
              {isEntrenamiento && (
                <TouchableOpacity
                  onPress={() => { setEndsIndefinitely(!endsIndefinitely); if (!endsIndefinitely) setEndsAt('') }}
                  className="flex-row items-center gap-2"
                >
                  <View className={`w-5 h-5 rounded border-2 items-center justify-center ${endsIndefinitely ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white dark:bg-dark-surface2 dark:border-dark-border'}`}>
                    {endsIndefinitely && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text className="text-sm text-gray-700 dark:text-dark-text2">Indefinido</Text>
                </TouchableOpacity>
              )}
            </View>

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

            {classType === 'periodica' && (
              <View className="border border-gray-200 dark:border-dark-border rounded-xl p-3 gap-2 bg-white dark:bg-dark-surface">
                <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Precio clase suelta <Text className="text-gray-400 font-normal">(opcional)</Text></Text>
                <TextInput value={priceSuelta} onChangeText={setPriceSuelta} placeholder="ej: 5000" placeholderTextColor="#9CA3AF" keyboardType="numeric" className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-gray-50 dark:bg-dark-surface2" />
                <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Precio 2x clase suelta <Text className="text-gray-400 font-normal">(opcional)</Text></Text>
                <TextInput value={priceSuelta2x} onChangeText={setPriceSuelta2x} placeholder="ej: 8000" placeholderTextColor="#9CA3AF" keyboardType="numeric" className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-gray-50 dark:bg-dark-surface2" />
              </View>
            )}
          </View>
        )}

        {/* Política de pago (item 3) */}
        <View className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2/40 p-3 gap-2">
          <TouchableOpacity onPress={() => setAllowLatePayment(!allowLatePayment)} className="flex-row items-center gap-2">
            <View className={`w-5 h-5 rounded border-2 items-center justify-center ${allowLatePayment ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white'}`}>
              {allowLatePayment && <Text className="text-white text-xs font-bold">✓</Text>}
            </View>
            <Text className="text-sm font-medium text-gray-800 dark:text-dark-text">Permitir pagos atrasados</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 dark:text-dark-text2">
            {allowLatePayment
              ? 'El alumno reserva el cupo y puede pagar después (queda como deudor hasta confirmar el pago o pagar por Mercado Pago).'
              : 'El cupo se reserva solo por 10 minutos mientras el alumno paga. Si no concreta el pago a tiempo, el cupo se libera.'}
          </Text>
        </View>

        {/* Location */}
        <View className="gap-3">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Lugar</Text>
            <TextInput value={locationName} onChangeText={setLocationName} placeholder="ej: Estudio Dance House" placeholderTextColor="#9CA3AF" className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2" />
          </View>
          <AddressPicker
            label="Dirección"
            value={locationAddress}
            hasCoords={!!coords}
            onChange={(a, c) => { setLocationAddress(a); setCoords(c) }}
          />
          <MobileCityPicker label="Ciudad" value={city} onChange={setCity} />
        </View>

        {/* Spots / Duration / Price */}
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Cupos *</Text>
            <TextInput value={maxSpots} onChangeText={setMaxSpots} keyboardType="numeric" className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.maxSpots ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`} />
            {errors.maxSpots && <Text className="text-xs text-red-600">{errors.maxSpots}</Text>}
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Duración (min)</Text>
            <TextInput value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="numeric" className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2" />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">{isPeriodic ? 'Precio/mes *' : 'Precio *'}</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="numeric" className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${errors.price ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`} />
            {errors.price && <Text className="text-xs text-red-600">{errors.price}</Text>}
          </View>
        </View>

        {/* Price 2x */}
        <View className="border border-brand-100 bg-brand-50/30 rounded-xl p-3 gap-1">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Precio 2x <Text className="text-gray-400 font-normal">(opcional)</Text></Text>
          <TextInput value={price2x} onChangeText={setPrice2x} placeholder="ej: 18000" placeholderTextColor="#9CA3AF" keyboardType="numeric" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white mt-1" />
        </View>

        {/* Media */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Fotos/Videos <Text className="text-gray-400 font-normal">(máx. 5)</Text></Text>
          {existingMedia.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {existingMedia.map((item) => (
                <View key={item.id} style={{ width: 90, height: 90 }} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
                  <Image source={{ uri: item.url }} style={{ width: 90, height: 90 }} />
                  <TouchableOpacity
                    onPress={() => removeExistingMedia(item)}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                  >
                    <Trash2 size={12} stroke="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {newMediaItems.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {newMediaItems.map((item, i) => (
                <View key={i} style={{ width: 90, height: 90 }} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2 border-2 border-brand-400">
                  <Image source={{ uri: item.uri }} style={{ width: 90, height: 90 }} />
                  <TouchableOpacity
                    onPress={() => setNewMediaItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
                  >
                    <X size={12} stroke="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {totalMedia < 5 && (
            <TouchableOpacity onPress={pickMedia} className="border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl p-6 items-center gap-2">
              <ImagePlus size={24} stroke="#9CA3AF" />
              <Text className="text-sm text-gray-500 dark:text-dark-text2">Agregar foto o video</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          className="bg-brand-600 rounded-xl py-3.5 items-center mt-2"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Guardar cambios</Text>}
        </TouchableOpacity>

        {/* Danger zone */}
        <View className="border-t border-gray-100 dark:border-dark-border pt-4 mt-2 gap-3">
          <Text className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider">Zona peligrosa</Text>
          {isEntrenamiento && !classData.audition_closed && (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/class/${id}/auditions` as any)}
              className="border border-brand-200 rounded-xl px-4 py-2.5 flex-row items-center gap-2"
            >
              <Text className="text-sm font-medium text-brand-700">Ver postulaciones</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={deleting}
            className="border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 flex-row items-center gap-2"
          >
            <Trash2 size={16} stroke="#dc2626" />
            <Text className="text-sm font-medium text-red-600 dark:text-red-400">
              {deleting ? 'Eliminando...' : 'Eliminar esta clase'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
