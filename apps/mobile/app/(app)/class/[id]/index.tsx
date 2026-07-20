import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
  Image, Modal, Pressable, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '../../../../context/ThemeContext'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import {
  ChevronLeft, MapPin, Clock, Users, Calendar, ChevronDown,
  ChevronRight, CheckCircle2, Tag, Music2, AlertCircle,
  UserPlus, X, Loader2, ArrowRight, Send, Video, Share2, Bell, CalendarPlus, MessageCircle, Lock, ScanQrCode,
} from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { Icon } from '../../../../components/ui/Icon'
import StyleChip from '../../../../components/ui/StyleChip'
import LeafletMap from '../../../../components/ui/LeafletMap'
import { supabase } from '../../../../lib/supabase'
import { sendNotifications } from '../../../../lib/notifications'
import { formatCLP, DAYS_OF_WEEK, canEnroll, pluralize, LEVEL_LABELS } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const WEB_URL = 'https://dc-project-web.vercel.app'

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  principiante: { bg: '#dcfce7', text: '#15803d' },
  intermedio: { bg: '#fef9c3', text: '#a16207' },
  avanzado: { bg: '#fee2e2', text: '#dc2626' },
  todos: { bg: '#dbeafe', text: '#1d4ed8' },
}

// ICS calendar export helper
function padN(n: number) { return String(n).padStart(2, '0') }
function icsDateStr(dateStr: string, timeStr: string | null | undefined, durationMinutes = 60) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr ?? '00:00').split(':').map(Number)
  const start = new Date(y, m - 1, d, hh, mm)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const fmt = (dt: Date) => `${dt.getFullYear()}${padN(dt.getMonth() + 1)}${padN(dt.getDate())}T${padN(dt.getHours())}${padN(dt.getMinutes())}00`
  return { start: fmt(start), end: fmt(end) }
}
function escICS(s: string) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n') }
function buildICS(cls: any): string {
  const summary = escICS(`${cls.title ?? 'Clase DanzClass'} — DanzClass`)
  const description = escICS(`Profesor: ${cls.teacher?.username ? '@' + cls.teacher.username : 'Profesor'}${cls.level ? '\nNivel: ' + (LEVEL_LABELS[cls.level as keyof typeof LEVEL_LABELS] ?? cls.level) : ''}`)
  const location = escICS(cls.city ?? cls.location ?? '')
  const duration = cls.duration_minutes ?? 60
  const events: string[] = []
  if (cls.type === 'suelta') {
    const { start, end } = icsDateStr(cls.date, cls.time, duration)
    events.push(`BEGIN:VEVENT\r\nUID:danzclass-${cls.id}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${summary}\r\nDESCRIPTION:${description}\r\nLOCATION:${location}\r\nEND:VEVENT`)
  } else if (cls.recurrence === 'custom') {
    ;(cls.custom_dates ?? []).forEach((dateStr: string, i: number) => {
      const { start, end } = icsDateStr(dateStr, cls.recurring_time, duration)
      events.push(`BEGIN:VEVENT\r\nUID:danzclass-${cls.id}-${i}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${summary}\r\nDESCRIPTION:${description}\r\nLOCATION:${location}\r\nEND:VEVENT`)
    })
  } else {
    const anchor = cls.start_date ?? cls.date ?? new Date().toISOString().split('T')[0]
    const { start, end } = icsDateStr(anchor, cls.recurring_time, duration)
    const rruleMap: Record<string, string> = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY' }
    const rrule = (rruleMap[cls.recurrence] ?? 'FREQ=WEEKLY') + (cls.ends_indefinitely || !cls.ends_at ? '' : `;UNTIL=${cls.ends_at.replace(/-/g, '')}T235959`)
    events.push(`BEGIN:VEVENT\r\nUID:danzclass-${cls.id}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nRRULE:${rrule}\r\nSUMMARY:${summary}\r\nDESCRIPTION:${description}\r\nLOCATION:${location}\r\nEND:VEVENT`)
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DanzClass//DanzClass//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'].join('\r\n')
}
async function addToCalendarMobile(cls: any) {
  try {
    const ics = buildICS(cls)
    const filename = `${(cls.title ?? 'clase').replace(/\s+/g, '_')}.ics`
    const fileUri = (FileSystem.documentDirectory ?? '') + filename
    await FileSystem.writeAsStringAsync(fileUri, ics, { encoding: FileSystem.EncodingType.UTF8 })
    await Linking.openURL(fileUri)
  } catch {
    Alert.alert('Error', 'No se pudo abrir el calendario. Intenta desde el navegador.')
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function CustomDatesModal({ dates, time, onClose }: { dates: string[]; time: string; onClose: () => void }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <View className="bg-white dark:bg-dark-surface rounded-t-3xl p-6" style={{ maxHeight: '70%' }}>
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text mb-4">Fechas programadas</Text>
          <ScrollView>
            {dates.sort().map((d) => (
              <View key={d} className="flex-row items-center gap-3 py-3 border-b border-gray-100 dark:border-dark-border">
                <View className="w-8 h-8 rounded-full bg-brand-50 items-center justify-center">
                  <Calendar size={14} stroke="#c026d3" />
                </View>
                <Text className="text-sm text-gray-800 dark:text-dark-text">{formatDate(d)} · {formatTime(time)}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} className="mt-4 bg-brand-600 rounded-xl py-3 items-center">
            <Text className="text-white font-semibold">Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

function VideoCarouselItem({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false })
  return (
    <VideoView
      player={player}
      style={{ width: SCREEN_WIDTH, minHeight: 240, maxHeight: 400 }}
      contentFit="contain"
      allowsFullscreen
    />
  )
}

// ─── Discount Modal ───────────────────────────────────────────────────────────
function DiscountModal({
  classId, classType, currentPrice, currentPriceSuelta,
  currentDiscountPrice, currentDiscountPriceMonthly,
  token, onClose, onSaved,
}: {
  classId: string; classType: string; currentPrice: number
  currentPriceSuelta: number | null; currentDiscountPrice: number | null
  currentDiscountPriceMonthly: number | null; token: string
  onClose: () => void; onSaved: (dp: number | null, dpm: number | null) => void
}) {
  const isPeriodic = classType === 'periodica' || classType === 'entrenamiento'
  const [discountPrice, setDiscountPrice] = useState(currentDiscountPrice ? String(currentDiscountPrice) : '')
  const [discountPriceMonthly, setDiscountPriceMonthly] = useState(currentDiscountPriceMonthly ? String(currentDiscountPriceMonthly) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const dp = discountPrice ? parseInt(discountPrice) : null
    const dpm = discountPriceMonthly ? parseInt(discountPriceMonthly) : null
    const basePrice = currentPriceSuelta ?? currentPrice
    if (dp !== null && dp >= basePrice) {
      setError('El precio con descuento debe ser menor al precio original')
      setSaving(false)
      return
    }
    if (dpm !== null && isPeriodic && dpm >= currentPrice) {
      setError('El precio mensual con descuento debe ser menor al precio mensual original')
      setSaving(false)
      return
    }
    const res = await fetch(`${WEB_URL}/api/class/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ class_id: classId, discount_price: dp, discount_price_monthly: isPeriodic ? dpm : null }),
    })
    if (!res.ok) {
      setError('Error al guardar. Intenta de nuevo.')
    } else {
      onSaved(dp, isPeriodic ? dpm : null)
    }
    setSaving(false)
  }

  async function handleClear() {
    setSaving(true)
    await fetch(`${WEB_URL}/api/class/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ class_id: classId, discount_price: null, discount_price_monthly: null }),
    })
    onSaved(null, null)
    setSaving(false)
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable>
            <View className="bg-white dark:bg-dark-surface rounded-t-3xl p-5">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#D85A3026' }}>
                    <Tag size={16} stroke="#D85A30" />
                  </View>
                  <Text className="text-base font-bold text-gray-900 dark:text-dark-text">Precio con descuento</Text>
                </View>
                <TouchableOpacity onPress={onClose} className="p-1.5 rounded-full">
                  <X size={16} stroke="#6B6880" />
                </TouchableOpacity>
              </View>

              {error && (
                <View className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                  <Text className="text-xs text-red-700">{error}</Text>
                </View>
              )}

              <View className="gap-4">
                <View>
                  <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">
                    {isPeriodic ? 'Precio clase suelta con descuento' : 'Precio con descuento'}
                    <Text className="text-xs text-gray-400"> (original: {formatCLP(currentPriceSuelta ?? currentPrice)})</Text>
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    value={discountPrice}
                    onChangeText={setDiscountPrice}
                    placeholder="ej: 8000"
                    placeholderTextColor="#9ca3af"
                    className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
                  />
                </View>
                {isPeriodic && (
                  <View>
                    <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">
                      Precio mensual con descuento
                      <Text className="text-xs text-gray-400"> (original: {formatCLP(currentPrice)})</Text>
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      value={discountPriceMonthly}
                      onChangeText={setDiscountPriceMonthly}
                      placeholder="ej: 12000"
                      placeholderTextColor="#9ca3af"
                      className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
                    />
                  </View>
                )}
                <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#D85A301A', borderWidth: 1, borderColor: '#D85A3033' }}>
                  <Text className="text-xs text-gris-humo">Al publicar, se notificará a todos tus seguidores sobre el descuento.</Text>
                </View>
              </View>

              <View className="flex-row gap-2 mt-5">
                {(currentDiscountPrice || currentDiscountPriceMonthly) && (
                  <TouchableOpacity
                    onPress={handleClear}
                    disabled={saving}
                    className="rounded-xl border border-gray-200 dark:border-dark-border px-4 py-3"
                  >
                    <Text className="text-sm font-medium text-gray-600 dark:text-dark-text2">Quitar descuento</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl py-3 items-center justify-center flex-row gap-2"
                  style={{ backgroundColor: '#D85A30' }}
                >
                  {saving && <ActivityIndicator size="small" color="white" />}
                  <Text className="text-sm font-semibold text-white">Publicar descuento</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Audition Modal ───────────────────────────────────────────────────────────
function AuditionModal({
  classId, userId, teacherId, existing, onClose, onSubmitted,
}: {
  classId: string; userId: string; teacherId: string
  existing?: { id: string; full_name?: string | null; age?: number | null; phone?: string | null; status?: string | null } | null
  onClose: () => void; onSubmitted: () => void
}) {
  const isEdit = !!existing && existing.status === 'pending'
  const [fullName, setFullName] = useState(existing?.full_name ?? '')
  const [age, setAge] = useState(existing?.age != null ? String(existing.age) : '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [videoName, setVideoName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    })
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri)
      const parts = result.assets[0].uri.split('/')
      setVideoName(parts[parts.length - 1])
    }
  }

  async function handleSubmit() {
    if (!fullName.trim()) { setError('El nombre completo es requerido'); return }
    setSubmitting(true)
    setError(null)

    let videoStoragePath: string | null = null

    if (videoUri) {
      const ext = videoUri.split('.').pop() ?? 'mp4'
      const path = `${userId}/${classId}.${ext}`
      const res = await fetch(videoUri)
      const blob = await res.blob()
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('audition-videos')
        .upload(path, blob, { upsert: true, contentType: `video/${ext}` })
      if (uploadErr || !uploadData) {
        setError('Error al subir el video. Intenta de nuevo.')
        setSubmitting(false)
        return
      }
      videoStoragePath = uploadData.path
    }

    if (isEdit && existing) {
      const update: any = {
        full_name: fullName.trim(),
        age: age ? parseInt(age) : null,
        phone: phone.trim() || null,
      }
      if (videoStoragePath) update.video_url = videoStoragePath
      const { error: updateErr } = await (supabase as any)
        .from('auditions')
        .update(update)
        .eq('id', existing.id)
        .eq('status', 'pending')
      if (updateErr) setError('Error al actualizar la postulación.')
      else onSubmitted()
      setSubmitting(false)
      return
    }

    const { error: insertErr } = await (supabase as any).from('auditions').insert({
      class_id: classId,
      applicant_id: userId,
      full_name: fullName.trim(),
      age: age ? parseInt(age) : null,
      phone: phone.trim() || null,
      video_url: videoStoragePath,
      status: 'pending',
    })

    if (insertErr) {
      setError(insertErr.message.includes('unique') ? 'Ya tienes una postulación enviada' : 'Error al enviar. Intenta de nuevo.')
    } else {
      await sendNotifications({
        user_id: teacherId,
        type: 'new_audition',
        data: { from_user_id: userId, class_id: classId },
      })
      onSubmitted()
    }
    setSubmitting(false)
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable>
            <View className="bg-white dark:bg-dark-surface rounded-t-3xl p-5" style={{ maxHeight: '90%' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-base font-bold text-gray-900 dark:text-dark-text">Postularme al entrenamiento</Text>
                  <TouchableOpacity onPress={onClose} className="p-1.5 rounded-full">
                    <X size={16} stroke="#6B6880" />
                  </TouchableOpacity>
                </View>

                {error && (
                  <View className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                    <Text className="text-xs text-red-700">{error}</Text>
                  </View>
                )}

                <View className="gap-4 mb-4">
                  <View>
                    <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Nombre completo *</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Tu nombre y apellido"
                      placeholderTextColor="#9ca3af"
                      className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
                    />
                  </View>

                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Edad <Text className="text-gray-400 font-normal">(opc.)</Text></Text>
                      <TextInput
                        keyboardType="numeric"
                        value={age}
                        onChangeText={setAge}
                        placeholder="25"
                        placeholderTextColor="#9ca3af"
                        className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">Teléfono <Text className="text-gray-400 font-normal">(opc.)</Text></Text>
                      <TextInput
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="+56 9 1234 5678"
                        placeholderTextColor="#9ca3af"
                        className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
                      />
                    </View>
                  </View>

                  <View>
                    <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">
                      Video bailando <Text className="text-gray-400 font-normal">(opc., máx. 100MB)</Text>
                    </Text>
                    {videoUri ? (
                      <View className="flex-row items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-3">
                        <Video size={18} stroke="#c026d3" />
                        <Text className="text-sm text-gray-700 flex-1" numberOfLines={1}>{videoName}</Text>
                        <TouchableOpacity onPress={() => { setVideoUri(null); setVideoName(null) }}>
                          <X size={14} stroke="#9ca3af" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={pickVideo}
                        className="rounded-xl border-2 border-dashed border-gray-200 p-5 items-center gap-2"
                      >
                        <Video size={24} stroke="#9ca3af" />
                        <Text className="text-sm text-gray-500">Seleccionar video</Text>
                        <Text className="text-xs text-gray-400">MP4, MOV — privado, solo el profesor lo verá</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  className="bg-brand-600 rounded-xl py-3 items-center flex-row justify-center gap-2"
                >
                  {submitting && <ActivityIndicator size="small" color="white" />}
                  <Text className="text-white font-semibold">{submitting ? 'Enviando...' : 'Enviar postulación'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { isDark } = useTheme()
  const [cls, setCls] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [enrollment, setEnrollment] = useState<any>(null)
  const [qrToken, setQrToken] = useState<{ token: string; status: 'active' | 'revoked' } | null>(null)
  const [spots, setSpots] = useState<any>(null)
  const [mediaIndex, setMediaIndex] = useState(0)
  const [showDates, setShowDates] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const carouselRef = useRef<ScrollView>(null)

  // 2x state
  const [twoxRequest, setTwoxRequest] = useState<any>(null)
  const [twoxState, setTwoxState] = useState<'idle' | 'looking' | 'matched'>('idle')
  const [twoxActing, setTwoxActing] = useState(false)
  const [friendsTwox, setFriendsTwox] = useState<any[]>([])
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)

  // Discount state
  const [discountData, setDiscountData] = useState({ discount_price: null as number | null, discount_price_monthly: null as number | null })
  const [showDiscountModal, setShowDiscountModal] = useState(false)

  // Audition state
  const [myAudition, setMyAudition] = useState<any>(null)
  const [showAuditionModal, setShowAuditionModal] = useState(false)
  const [auditionSubmitted, setAuditionSubmitted] = useState(false)

  // Waitlist state
  const [isInWaitlist, setIsInWaitlist] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)

  // Package state
  const [classPackages, setClassPackages] = useState<any[]>([])
  const [myPackageEnrollments, setMyPackageEnrollments] = useState<any[]>([])
  const [pkgEnrolling, setPkgEnrolling] = useState<string | null>(null)
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      setUserId(session.user.id)
      setToken(session.access_token)

      const [clsRes, subRes, spotsRes] = await Promise.all([
        (supabase as any)
          .from('classes')
          .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
          .eq('id', id)
          .single(),
        supabase.from('subscriptions').select('tier').eq('user_id', session.user.id).eq('status', 'active').single(),
        (supabase as any).from('class_spots').select('*').eq('class_id', id).maybeSingle(),
      ])

      setCls(clsRes.data)
      setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
      setSpots(spotsRes.data)

      if (clsRes.data) {
        setDiscountData({
          discount_price: clsRes.data.discount_price ?? null,
          discount_price_monthly: clsRes.data.discount_price_monthly ?? null,
        })
      }

      // Enrollment check
      const { data: existing } = await supabase
        .from('enrollments')
        .select('*, payment:payments(*)')
        .eq('student_id', session.user.id)
        .eq('class_id', id as string)
        .neq('status', 'cancelled')
        .maybeSingle()
      setEnrollment(existing)

      // QR de asistencia — RLS (qr_tokens_select_own) solo deja ver el propio.
      // Se busca aunque el enrollment no esté confirmado todavía por si quedó
      // una fila 'revoked' de un ciclo de pago anterior sobre el mismo enrollment.
      if (existing) {
        const { data: qr } = await (supabase as any)
          .from('qr_tokens')
          .select('token, status')
          .eq('enrollment_id', existing.id)
          .maybeSingle()
        setQrToken(qr ?? null)
      }

      // 2x request check
      const { data: twox } = await (supabase as any)
        .from('class_2x_requests')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('class_id', id)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (twox) {
        setTwoxRequest(twox)
        setTwoxState(twox.status === 'matched' ? 'matched' : 'looking')
      }

      // Friends 2x requests
      const { data: friendships } = await (supabase as any)
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`)
      const friendIds = ((friendships as any[]) ?? []).map((f: any) =>
        f.requester_id === session.user.id ? f.addressee_id : f.requester_id
      )
      if (friendIds.length > 0) {
        const { data: fTwox } = await (supabase as any)
          .from('class_2x_requests')
          .select('*, user:profiles!user_id(username, full_name, avatar_url)')
          .in('user_id', friendIds)
          .eq('class_id', id)
          .eq('status', 'looking')
        setFriendsTwox((fTwox as any[]) ?? [])
      }

      // Audition check (only for entrenamiento)
      if (clsRes.data?.type === 'entrenamiento') {
        const { data: audition } = await (supabase as any)
          .from('auditions')
          .select('*')
          .eq('class_id', id)
          .eq('applicant_id', session.user.id)
          .maybeSingle()
        if (audition) {
          setMyAudition(audition)
          setAuditionSubmitted(true)
        }
      }

      // Waitlist check
      const { data: waitlistEntry } = await (supabase as any)
        .from('waitlist')
        .select('id')
        .eq('class_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle()
      setIsInWaitlist(!!waitlistEntry)

      // Packages for this class
      const { data: pkgsData } = await (supabase as any)
        .from('class_packages')
        .select(`id, title, description, price, status, items:class_package_items(class_id, class:classes(id, title, dance_style))`)
        .eq('status', 'active')
      const filtered = ((pkgsData ?? []) as any[]).filter((p: any) =>
        (p.items ?? []).some((item: any) => item.class_id === id)
      )
      setClassPackages(filtered)
      if (filtered.length > 0) {
        const pkgIds = filtered.map((p: any) => p.id)
        const { data: myPkgEnrollments } = await (supabase as any)
          .from('package_enrollments')
          .select('*')
          .in('package_id', pkgIds)
          .eq('student_id', session.user.id)
        setMyPackageEnrollments((myPkgEnrollments ?? []) as any[])
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ─── Share handler ────────────────────────────────────────────────────────
  async function handleShare() {
    if (!cls) return
    try {
      await Share.share({
        message: `${cls.title} — ${WEB_URL}/class/${cls.id}`,
        title: cls.title,
      })
    } catch {
      // user cancelled or error — no action needed
    }
  }

  // ─── 2x handlers ─────────────────────────────────────────────────────────
  async function handle2xCreate() {
    if (!userId) return
    setTwoxActing(true)
    const { data, error } = await (supabase as any)
      .from('class_2x_requests')
      .insert({ user_id: userId, class_id: id, status: 'looking' })
      .select()
      .single()
    if (!error && data) {
      setTwoxRequest(data)
      setTwoxState('looking')
    }
    setTwoxActing(false)
  }

  async function handle2xCancel() {
    if (!twoxRequest) return
    setTwoxActing(true)
    await (supabase as any).from('class_2x_requests').update({ status: 'cancelled' }).eq('id', twoxRequest.id)
    setTwoxRequest(null)
    setTwoxState('idle')
    setTwoxActing(false)
  }

  async function handle2xTransferPayment() {
    if (!twoxRequest || !token) return
    setTwoxActing(true)
    await fetch(`${WEB_URL}/api/class-2x/transfer-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ request_id: twoxRequest.id }),
    })
    const { data } = await (supabase as any).from('class_2x_requests').select('*').eq('id', twoxRequest.id).single()
    setTwoxRequest(data)
    setTwoxActing(false)
  }

  async function handleJoin2x(requestId: string) {
    if (!token) return
    setMatchError(null)
    const res = await fetch(`${WEB_URL}/api/class-2x/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ request_id: requestId }),
    })
    if (res.ok) {
      setFriendsTwox((prev) => prev.filter((r) => r.id !== requestId))
      Alert.alert('¡Emparejad@!', 'Coordinaste el 2x. Revisa tus inscripciones para pagar.')
    } else if (res.status === 404) {
      setMatchError('Este 2x ya fue tomado por otra persona.')
      setFriendsTwox((prev) => prev.filter((r) => r.id !== requestId))
    } else {
      setMatchError('Error al unirse al 2x. Intenta de nuevo.')
    }
  }

  // ─── Enrollment handlers ──────────────────────────────────────────────────
  async function handleEnroll() {
    if (!userId || !token || isFull) return
    // Inscripción abierta a todos (marketplace): sin plan también reserva y luego
    // paga in-app por Mercado Pago con comisión en la pantalla de pago.
    setEnrolling(true)
    const res = await fetch(`${WEB_URL}/api/class/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ classId: cls.id }),
    })
    if (res.ok) {
      const json = await res.json()
      setEnrollment(json.enrollment)
      setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available - 1 } : prev)
      setEnrolling(false)
      router.push(`/(app)/payment/${json.enrollment.id}` as any)
    } else {
      setEnrolling(false)
      const json = await res.json().catch(() => ({}))
      if (json.error === 'subscription_required') {
        Alert.alert(
          'Plan requerido',
          'Necesitas un plan activo para inscribirte en clases.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Ver planes', onPress: () => router.push('/(app)/plans' as any) },
          ]
        )
      } else if (json.error === 'already_enrolled') {
        Alert.alert('Ya inscrito', 'Ya tienes una inscripción activa en esta clase.')
      } else if (json.error === 'no_spots') {
        Alert.alert('Sin cupos', 'No hay cupos disponibles.')
      } else {
        Alert.alert('Error', 'No se pudo inscribir. Intenta nuevamente.')
      }
    }
  }

  async function handleLeave() {
    if (!userId || !enrollment || !token) return
    // Solo hay un QR de asistencia vivo si el pago está confirmado (ver renderQrSection).
    const hasLiveQr = enrollment.status === 'confirmed' && qrToken?.status === 'active'
    Alert.alert(
      'Salir de la clase',
      hasLiveQr
        ? 'Perderás tu acceso QR a esta clase. ¿Continuar?'
        : '¿Estás seguro? Perderás tu lugar y deberás reinscribirte.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir', style: 'destructive',
          onPress: async () => {
            setLeaving(true)
            await fetch(`${WEB_URL}/api/class/leave`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ enrollmentId: enrollment.id }),
            })
            setEnrollment(null)
            setQrToken(null)
            setSpots((prev: any) => prev ? { ...prev, spots_available: prev.spots_available + 1 } : prev)
            setLeaving(false)
          },
        },
      ]
    )
  }

  async function handleJoinWaitlist() {
    if (!token) return
    setWaitlistLoading(true)
    const res = await fetch(`${WEB_URL}/api/class/waitlist/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ classId: cls.id }),
    })
    if (res.ok) setIsInWaitlist(true)
    setWaitlistLoading(false)
  }

  async function handleLeaveWaitlist() {
    if (!token) return
    setWaitlistLoading(true)
    const res = await fetch(`${WEB_URL}/api/class/waitlist/leave`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ classId: cls.id }),
    })
    if (res.ok) setIsInWaitlist(false)
    setWaitlistLoading(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  // Clases archivadas (item 1) ya no tienen página: solo persisten en el
  // Historial. 'completed' es el estado legacy equivalente (media ya eliminada).
  if (!cls || cls.status === 'archived' || cls.status === 'completed') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg px-8">
        <Text className="text-gray-500 dark:text-dark-text2 text-center">
          {cls && (cls.status === 'archived' || cls.status === 'completed')
            ? 'Esta clase ya finalizó y solo está disponible en tu Historial.'
            : 'Clase no encontrada'}
        </Text>
      </SafeAreaView>
    )
  }

  const teacher = cls.teacher
  const media = [...(cls.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  const isTeacher = cls.teacher_id === userId
  const isPeriodic = cls.type === 'periodica' || cls.type === 'entrenamiento'
  const isEntrenamiento = cls.type === 'entrenamiento'
  const isCustom = cls.recurrence === 'custom'
  const spotsAvailable = spots?.spots_available ?? cls.max_spots
  const isFull = spotsAvailable <= 0
  const levelColors = LEVEL_COLORS[cls.level] ?? { bg: '#f3f4f6', text: '#374151' }

  const activePrice = isPeriodic
    ? (discountData.discount_price_monthly ?? cls.price)
    : (discountData.discount_price ?? cls.price)
  const hasDiscount = activePrice < cls.price

  // QR de asistencia — usado tanto en la rama de entrenamiento con audición
  // como en la de inscripción regular (ambas muestran "confirmado" abajo).
  function renderQrSection() {
    if (!enrollment) return null

    if (enrollment.status !== 'confirmed') {
      return (
        <View className="flex-row items-center gap-2">
          <Lock size={12} stroke={isDark ? '#A39BBF' : '#6B6880'} />
          <Text className="text-xs text-gray-500 dark:text-dark-text2 flex-1">
            Tu código QR de asistencia se generará cuando se confirme tu pago
          </Text>
        </View>
      )
    }

    if (!qrToken) {
      return (
        <View className="flex-row items-center justify-center gap-2 py-2">
          <ActivityIndicator size="small" color={isDark ? '#A39BBF' : '#6B6880'} />
          <Text className="text-xs text-gray-500 dark:text-dark-text2">Generando tu código QR…</Text>
        </View>
      )
    }

    if (qrToken.status === 'revoked') {
      return (
        <View className="flex-row items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-2">
          <AlertCircle size={14} stroke="#D85A30" />
          <Text className="text-xs text-orange-700 dark:text-orange-400 font-medium flex-1">
            Tu código QR fue revocado. Contacta al profesor si crees que es un error.
          </Text>
        </View>
      )
    }

    const dateLabel = cls.type === 'suelta'
      ? `Válido el ${formatDate(cls.date)}`
      : isCustom
        ? 'Válido en las fechas programadas'
        : 'Válido en cada sesión de esta clase'

    return (
      <View className="items-center bg-brand-50 dark:bg-dark-surface2 rounded-2xl p-4 gap-2 border border-brand-100 dark:border-dark-border">
        <View className="bg-white rounded-xl p-3">
          <QRCode value={qrToken.token} size={160} backgroundColor="#ffffff" color="#1A1035" />
        </View>
        <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text text-center mt-1">
          {cls.title}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-dark-text2 text-center">{dateLabel}</Text>
        {isCustom && (
          <TouchableOpacity onPress={() => setShowDates(true)}>
            <Text className="text-xs text-brand-700 dark:text-brand-300 font-medium underline">Ver fechas</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const has2xPrice = !!(cls.price_2x || cls.price_suelta_2x)
  const price2x = cls.price_2x ?? cls.price_suelta_2x
  const price2xLabel = cls.price_2x
    ? (isPeriodic ? 'mensual por ambos' : 'total por ambos')
    : 'suelta por ambos'
  const isMyTurnToPay2x = twoxRequest?.payment_assignee === userId

  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const scheduleText = cls.type === 'suelta'
    ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
    : isCustom
      ? `${cls.custom_dates?.length ?? 0} clases programadas · ${formatTime(cls.recurring_time)}`
      : `${recurrenceLabel[cls.recurrence] ?? ''} · ${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`

  // Training with audition: enrollment auto-created on accept — never show "Reservar lugar"
  const canEnrollDirectly = !isEntrenamiento || !cls.requires_audition
  const auditionOpen = isEntrenamiento && cls.requires_audition && !cls.audition_closed

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900 dark:text-dark-text flex-1" numberOfLines={1}>{cls.title}</Text>
        {/* Share button — visible for all users */}
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Share2 size={20} stroke="#6B6880" />
        </TouchableOpacity>
        {isTeacher && (
          <TouchableOpacity
            onPress={() => router.push(`/(app)/class/${cls.id}/scan-attendance?title=${encodeURIComponent(cls.title)}` as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ScanQrCode size={20} stroke={isDark ? '#EEEDFE' : '#374151'} />
          </TouchableOpacity>
        )}
        {isTeacher && (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setShowDiscountModal(true)}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border"
              style={{ borderColor: '#D85A30', backgroundColor: '#D85A301A' }}
            >
              <Tag size={12} stroke="#D85A30" />
              <Text className="text-xs font-semibold" style={{ color: '#D85A30' }}>Descuento</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/(app)/class/${cls.id}/edit` as any)}>
              <Text className="text-brand-600 text-sm font-semibold">Editar</Text>
            </TouchableOpacity>
          </View>
        )}
        {isTeacher && isEntrenamiento && cls.requires_audition && (
          <TouchableOpacity onPress={() => router.push(`/(app)/class/${cls.id}/auditions` as any)}>
            <Text className="text-brand-600 text-sm font-semibold">Postulaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Media carousel */}
        {media.length > 0 ? (
          <View className="bg-black" style={{ minHeight: 240 }}>
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e: any) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                setMediaIndex(index)
              }}
            >
              {media.map((item: any) => (
                <View key={item.id} style={{ width: SCREEN_WIDTH, minHeight: 240 }} className="bg-black items-center justify-center">
                  {item.type === 'video' ? (
                    <VideoCarouselItem url={item.url} />
                  ) : (
                    <Image
                      source={{ uri: item.url }}
                      style={{ width: SCREEN_WIDTH, minHeight: 240, maxHeight: 420 }}
                      resizeMode="contain"
                    />
                  )}
                </View>
              ))}
            </ScrollView>
            {media.length > 1 && (
              <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center gap-2">
                <TouchableOpacity
                  onPress={() => {
                    const next = Math.max(0, mediaIndex - 1)
                    carouselRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setMediaIndex(next)
                  }}
                  disabled={mediaIndex === 0}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ChevronLeft size={22} stroke={mediaIndex === 0 ? 'rgba(255,255,255,0.25)' : 'white'} />
                </TouchableOpacity>
                {media.map((_: any, i: number) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { carouselRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true }); setMediaIndex(i) }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <View className={`h-2 rounded-full ${i === mediaIndex ? 'w-5 bg-white' : 'w-2 bg-white/50'}`} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    const next = Math.min(media.length - 1, mediaIndex + 1)
                    carouselRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setMediaIndex(next)
                  }}
                  disabled={mediaIndex === media.length - 1}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ChevronRight size={22} stroke={mediaIndex === media.length - 1 ? 'rgba(255,255,255,0.25)' : 'white'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View className="items-center justify-center bg-gray-100 dark:bg-dark-surface2" style={{ height: 160 }}>
            <Icon icon={Music2} size={40} />
          </View>
        )}

        {/* Discount banner */}
        {hasDiscount && (
          <View className="flex-row items-center gap-2 px-4 py-2" style={{ backgroundColor: '#D85A30' }}>
            <Tag size={14} stroke="white" />
            <Text className="text-white text-sm font-semibold">¡Descuento activo!</Text>
          </View>
        )}

        {/* Friends looking for 2x — collapsible */}
        {!isTeacher && friendsTwox.length > 0 && (
          <View className="border-b border-gray-100 dark:border-dark-border bg-blanco-violeta dark:bg-dark-surface2">
            <TouchableOpacity
              onPress={() => setFriendsOpen((o) => !o)}
              className="flex-row items-center justify-between px-4 py-3"
            >
              <View className="flex-row items-center gap-2">
                <View className="w-6 h-6 rounded-full bg-brand-600 items-center justify-center">
                  <Users size={14} stroke="white" />
                </View>
                <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                  {friendsTwox.length === 1
                    ? '1 amig@ busca compañer@ 2x'
                    : `${friendsTwox.length} amig@s buscan compañer@ 2x`}
                </Text>
              </View>
              {friendsOpen ? <ChevronDown size={16} stroke="#6B6880" /> : <ChevronRight size={16} stroke="#6B6880" />}
            </TouchableOpacity>
            {friendsOpen && (
              <View className="px-4 pb-3 gap-2">
                {matchError && (
                  <View className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                    <Text className="text-xs text-red-600">{matchError}</Text>
                  </View>
                )}
                {friendsTwox.map((entry: any) => (
                  <View key={entry.id} className="flex-row items-center gap-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border px-3 py-2.5">
                    {entry.user?.avatar_url ? (
                      <Image source={{ uri: entry.user.avatar_url }} className="w-8 h-8 rounded-full" />
                    ) : (
                      <View className="w-8 h-8 rounded-full bg-brand-100 items-center justify-center">
                        <Text className="text-brand-700 text-xs font-bold">
                          {(entry.user?.full_name ?? '').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                        </Text>
                      </View>
                    )}
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text" numberOfLines={1}>{entry.user?.full_name}</Text>
                      {price2x && (
                        <Text className="text-xs text-brand-600 font-medium">{formatCLP(price2x)} en pareja</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleJoin2x(entry.id)}
                      className="bg-brand-600 rounded-full px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-white">¡Ir juntos!</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View className="px-4 pt-4 gap-4">
          {/* Teacher row */}
          <TouchableOpacity
            onPress={() => teacher?.username && router.push(`/(app)/teacher/${teacher.username}` as any)}
            className="flex-row items-center gap-3"
          >
            {teacher?.avatar_url ? (
              <Image source={{ uri: teacher.avatar_url }} className="w-10 h-10 rounded-full" />
            ) : (
              <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 font-bold text-sm">
                  {(teacher?.full_name ?? '').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                </Text>
              </View>
            )}
            <View>
              <Text className="font-semibold text-gray-900 dark:text-dark-text text-sm">{teacher?.full_name}</Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2">@{teacher?.username}</Text>
            </View>
            <ChevronRight size={16} stroke="#9ca3af" />
          </TouchableOpacity>

          {/* Title + badges */}
          <View>
            <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">{cls.title}</Text>
            <View className="flex-row flex-wrap items-center gap-2 mt-2">
              {cls.dance_style && (
                <StyleChip style={cls.dance_style} sub={cls.class_type} />
              )}
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: levelColors.bg }}>
                <Text className="text-xs font-medium" style={{ color: levelColors.text }}>{LEVEL_LABELS[cls.level as keyof typeof LEVEL_LABELS] ?? cls.level}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {cls.description && (
            <Text className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed">{cls.description}</Text>
          )}

          {/* Info rows */}
          <View className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border gap-3">
            <View className="flex-row items-center gap-3">
              <Clock size={16} stroke="#6B6880" />
              <View className="flex-1">
                <Text className="text-sm text-gray-800 dark:text-dark-text">{scheduleText}</Text>
                <Text className="text-xs text-gris-humo dark:text-dark-text2">{cls.duration_minutes} minutos</Text>
              </View>
              {isCustom && (
                <TouchableOpacity
                  onPress={() => setShowDates(true)}
                  className="flex-row items-center gap-1 bg-brand-50 rounded-xl px-3 py-1.5"
                >
                  <Calendar size={12} stroke="#c026d3" />
                  <Text className="text-xs text-brand-700 font-medium">Ver fechas</Text>
                </TouchableOpacity>
              )}
            </View>
            {isEntrenamiento && cls.billing_day && (
              <View className="flex-row items-center gap-3">
                <Calendar size={16} stroke="#6B6880" />
                <Text className="text-sm text-gray-800 dark:text-dark-text">Cobro mensual el día <Text className="font-semibold">{cls.billing_day}</Text> de cada mes</Text>
              </View>
            )}
            {(cls.location_name || cls.location_address) && (
              <LeafletMap
                lat={cls.latitude}
                lng={cls.longitude}
                name={cls.location_name}
                address={cls.location_address}
              />
            )}
            <View className="flex-row items-center gap-3">
              <Users size={16} stroke="#6B6880" />
              <Text className={`text-sm ${isFull ? 'text-red-600' : spotsAvailable <= 3 ? 'text-orange-600' : 'text-gray-800 dark:text-dark-text'}`}>
                {isFull ? 'Sin cupos disponibles' : `${pluralize(spotsAvailable, 'cupo', 'cupos')} disponible${spotsAvailable !== 1 ? 's' : ''} de ${cls.max_spots}`}
              </Text>
            </View>
          </View>

          {/* Audition section for students (entrenamiento) */}
          {!isTeacher && isEntrenamiento && cls.requires_audition && (
            <View className={`rounded-2xl border p-4 ${auditionSubmitted ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-900/50'}`}>
              {auditionSubmitted ? (
                <View className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <CheckCircle2 size={16} stroke="#2563eb" />
                    <Text className="text-sm font-semibold text-blue-700 dark:text-blue-400">Postulación enviada</Text>
                    {myAudition?.status === 'accepted' && (
                      <View className="ml-2 bg-green-100 dark:bg-green-900/30 rounded-full px-2 py-0.5">
                        <Text className="text-xs font-semibold text-green-700 dark:text-green-400">Aceptada</Text>
                      </View>
                    )}
                    {myAudition?.status === 'rejected' && (
                      <View className="ml-2 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5">
                        <Text className="text-xs font-semibold text-red-600 dark:text-red-400">No seleccionad@</Text>
                      </View>
                    )}
                  </View>
                  {myAudition?.status === 'pending' && (
                    <TouchableOpacity onPress={() => setShowAuditionModal(true)}>
                      <Text className="text-xs text-blue-700 dark:text-blue-400 font-medium underline">Editar postulación</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : cls.audition_closed ? (
                <View className="flex-row items-center gap-2">
                  <AlertCircle size={16} stroke="#6B6880" />
                  <Text className="text-sm text-gray-600 dark:text-dark-text2">Las postulaciones están cerradas</Text>
                </View>
              ) : (
                <View className="gap-2">
                  <Text className="text-sm font-semibold text-brand-700 dark:text-brand-300">Este entrenamiento requiere postulación</Text>
                  <TouchableOpacity
                    onPress={() => setShowAuditionModal(true)}
                    className="bg-brand-600 rounded-xl py-2.5 items-center flex-row justify-center gap-2"
                  >
                    <UserPlus size={16} stroke="white" />
                    <Text className="text-sm font-semibold text-white">Postularme</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Enrollment CTA for accepted auditions (training-with-audition bypasses canEnrollDirectly) */}
          {!isTeacher && isEntrenamiento && cls.requires_audition && enrollment && enrollment.status !== 'cancelled' && (
            <View className="gap-2">
              <View className="flex-row items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                <CheckCircle2 size={14} stroke="#16a34a" />
                <Text className="text-xs text-green-700 dark:text-green-400 font-medium flex-1">
                  {enrollment.status === 'confirmed'
                    ? 'Inscrit@ — pago confirmado'
                    : enrollment.status === 'payment_submitted'
                      ? 'Pago enviado — esperando confirmación'
                      : 'Cupo reservado — pago pendiente'}
                </Text>
              </View>
              {enrollment.status === 'pending_payment' && (
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/payment/${enrollment.id}` as any)}
                  className="bg-brand-600 rounded-xl py-3 items-center"
                >
                  <Text className="text-white font-semibold">Ir a pagar</Text>
                </TouchableOpacity>
              )}
              {enrollment.status === 'confirmed' && (
                <TouchableOpacity onPress={() => addToCalendarMobile(cls)} className="flex-row items-center justify-center gap-1.5 py-2">
                  <CalendarPlus size={14} stroke={isDark ? '#86efac' : '#15803d'} />
                  <Text className="text-xs text-green-700 dark:text-green-400 font-medium">Agregar a calendario</Text>
                </TouchableOpacity>
              )}
              {renderQrSection()}
              <TouchableOpacity onPress={handleLeave} disabled={leaving} className="py-2 items-center">
                <Text className="text-xs text-red-500 dark:text-red-400">{leaving ? 'Saliendo...' : 'Salir del entrenamiento'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Price section */}
          <View className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900/40 gap-2">
            <View className="flex-row items-end gap-3">
              <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">{formatCLP(activePrice)}</Text>
              {hasDiscount && (
                <Text className="text-sm text-gray-400 dark:text-dark-text2 line-through mb-0.5">{formatCLP(cls.price)}</Text>
              )}
              {isPeriodic && <Text className="text-sm text-gray-500 dark:text-dark-text2 mb-0.5">/mes</Text>}
            </View>
            {isPeriodic && cls.price_suelta && (
              <Text className="text-sm text-gray-600 dark:text-dark-text2">
                Suelta: {formatCLP(discountData.discount_price ?? cls.price_suelta)}
                {discountData.discount_price && discountData.discount_price < cls.price_suelta && (
                  <Text className="text-gray-400 line-through"> {formatCLP(cls.price_suelta)}</Text>
                )}
              </Text>
            )}

            {/* CTA for student */}
            {!isTeacher && canEnrollDirectly && (
              enrollment ? (
                <View className="gap-2 mt-1">
                  <View className="flex-row items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <CheckCircle2 size={14} stroke="#16a34a" />
                    <Text className="text-xs text-green-700 font-medium flex-1">
                      {enrollment.status === 'confirmed'
                        ? 'Inscrit@ — pago confirmado'
                        : enrollment.status === 'payment_submitted'
                          ? 'Pago enviado — esperando confirmación'
                          : 'Inscrit@ — pago pendiente'}
                    </Text>
                  </View>
                  {enrollment.status === 'pending_payment' && (
                    <TouchableOpacity
                      onPress={() => router.push(`/(app)/payment/${enrollment.id}` as any)}
                      className="bg-brand-600 rounded-xl py-3 items-center"
                    >
                      <Text className="text-white font-semibold">Enviar comprobante</Text>
                    </TouchableOpacity>
                  )}
                  {enrollment.status === 'confirmed' && (
                    <TouchableOpacity onPress={() => addToCalendarMobile(cls)} className="flex-row items-center justify-center gap-1.5 py-2">
                      <CalendarPlus size={14} stroke={isDark ? '#86efac' : '#15803d'} />
                      <Text className="text-xs text-green-700 dark:text-green-400 font-medium">Agregar a calendario</Text>
                    </TouchableOpacity>
                  )}
                  {renderQrSection()}
                  {/* Chat con el profesor */}
                  <TouchableOpacity
                    onPress={async () => {
                      if (!token) return
                      const res = await fetch(`${WEB_URL}/api/chat/get-or-create`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ type: 'class', class_id: id }),
                      })
                      if (res.ok) {
                        const { chat_id } = await res.json()
                        router.push(`/(app)/chat/${chat_id}` as any)
                      }
                    }}
                    className="flex-row items-center justify-center gap-1.5 py-2"
                  >
                    <MessageCircle size={14} stroke={isDark ? '#c4b5fd' : '#7c3aed'} />
                    <Text className="text-xs text-violet-600 dark:text-violet-400 font-medium">Chat con el profesor</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleLeave} disabled={leaving} className="py-2 items-center">
                    <Text className="text-xs text-red-500">{leaving ? 'Saliendo...' : 'Salir de la clase'}</Text>
                  </TouchableOpacity>
                </View>
              ) : isFull ? (
                <View className="mt-2 items-center gap-2">
                  {isInWaitlist ? (
                    <>
                      <View className="flex-row items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 w-full">
                        <Bell size={14} stroke="#c026d3" />
                        <Text className="text-xs text-brand-700 font-medium flex-1">Estás en la lista de espera</Text>
                      </View>
                      <TouchableOpacity onPress={handleLeaveWaitlist} disabled={waitlistLoading} className="py-1">
                        <Text className="text-xs text-gray-400 underline">
                          {waitlistLoading ? 'Procesando...' : 'Salir de la lista'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={handleJoinWaitlist}
                      disabled={waitlistLoading || !userId}
                      className="flex-row items-center gap-2 rounded-xl border border-gray-300 bg-transparent py-3 px-4 w-full justify-center"
                    >
                      {waitlistLoading
                        ? <ActivityIndicator size="small" color="#6B6880" />
                        : <Bell size={16} stroke="#6B6880" />
                      }
                      <Text className="font-semibold text-gray-600">Avisarme si hay cupo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View>
                  <TouchableOpacity
                    onPress={handleEnroll}
                    disabled={enrolling}
                    className="rounded-xl py-3 items-center mt-1 bg-brand-600"
                  >
                    <Text className="font-semibold text-white">
                      {enrolling ? 'Inscribiendo...' : 'Reservar lugar'}
                    </Text>
                  </TouchableOpacity>
                  {cls.allow_late_payment === false && (
                    <Text className="text-xs text-coral-fuego font-medium mt-2">
                      ⏱️ Esta clase no permite pagos atrasados: al reservar tienes 10 minutos para completar el pago o el cupo se libera.
                    </Text>
                  )}
                </View>
              )
            )}

            {/* Paquetes disponibles */}
            {classPackages.length > 0 && !isTeacher && (
              <View className="mt-3">
                <Text className="text-xs font-semibold text-gray-700 dark:text-dark-text2 mb-2">Paquetes disponibles</Text>
                {classPackages.map((pkg: any) => {
                  const myEnrollment = myPackageEnrollments.find((e: any) => e.package_id === pkg.id)
                  const isExpanded = expandedPkg === pkg.id
                  return (
                    <View key={pkg.id} className="mb-2 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/30 dark:bg-dark-surface overflow-hidden">
                      <TouchableOpacity onPress={() => setExpandedPkg(isExpanded ? null : pkg.id)} className="p-3 flex-row items-center gap-2">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{pkg.title}</Text>
                          <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(pkg.price)}</Text>
                          <Text className="text-xs text-gray-400 dark:text-dark-text2">{(pkg.items ?? []).length} clases incluidas</Text>
                        </View>
                        <ChevronDown size={16} stroke={isDark ? '#A39BBF' : '#9ca3af'} />
                      </TouchableOpacity>
                      {isExpanded && (
                        <View className="border-t border-violet-100 dark:border-dark-border px-3 pb-3 pt-2">
                          {(pkg.items ?? []).map((item: any) => (
                            <Text key={item.class_id} className="text-xs text-gray-600 dark:text-dark-text2 mb-0.5">• {item.class?.title}</Text>
                          ))}
                          {myEnrollment ? (
                            <View className="mt-2 rounded-lg bg-violet-100 dark:bg-violet-900/20 px-3 py-2">
                              <Text className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                                {myEnrollment.status === 'confirmed' ? '✓ Pago confirmado' :
                                 myEnrollment.status === 'payment_submitted' ? 'Comprobante enviado — pendiente de verificación' :
                                 'Inscrito — pendiente de pago'}
                              </Text>
                            </View>
                          ) : canEnroll(tier) ? (
                            <TouchableOpacity
                              onPress={async () => {
                                setPkgEnrolling(pkg.id)
                                const res = await fetch(`${WEB_URL}/api/packages/${pkg.id}/enroll`, {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${token}` },
                                })
                                if (res.ok) {
                                  const data = await res.json()
                                  setMyPackageEnrollments((prev) => [...prev, { id: data.package_enrollment_id, package_id: pkg.id, status: 'pending_payment' }])
                                }
                                setPkgEnrolling(null)
                              }}
                              disabled={pkgEnrolling === pkg.id}
                              className="mt-2 rounded-xl bg-violet-600 py-2.5 items-center"
                            >
                              <Text className="text-sm font-semibold text-white">{pkgEnrolling === pkg.id ? 'Inscribiendo...' : `Inscribirse — ${formatCLP(pkg.price)}`}</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text className="text-xs text-gray-400 dark:text-dark-text2 mt-1 text-center">Necesitas un plan para inscribirte.</Text>
                          )}
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}

            {/* 2x button — shown if class has 2x price and is not full */}
            {!isTeacher && has2xPrice && !isFull && !enrollment && (
              <View className="mt-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3 gap-2">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs font-semibold text-brand-700">Precio pareja (2x)</Text>
                    <Text className="text-lg font-bold text-brand-900">{formatCLP(price2x)}</Text>
                    <Text className="text-xs text-brand-600">{price2xLabel}</Text>
                  </View>
                  {twoxState === 'idle' && (
                    <TouchableOpacity
                      onPress={handle2xCreate}
                      disabled={twoxActing}
                      className="flex-row items-center gap-1.5 bg-brand-600 rounded-full px-4 py-2"
                    >
                      {twoxActing ? <ActivityIndicator size="small" color="white" /> : <Users size={14} stroke="white" />}
                      <Text className="text-sm font-semibold text-white">Busco 2x</Text>
                    </TouchableOpacity>
                  )}
                  {twoxState === 'looking' && (
                    <TouchableOpacity
                      onPress={handle2xCancel}
                      disabled={twoxActing}
                      className="flex-row items-center gap-1.5 border border-brand-300 rounded-full px-3 py-2"
                    >
                      {twoxActing ? <ActivityIndicator size="small" color="#c026d3" /> : <X size={14} stroke="#c026d3" />}
                      <Text className="text-xs font-medium text-brand-700">Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {twoxState === 'looking' && (
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2 h-2 rounded-full bg-brand-400" />
                    <Text className="text-xs text-brand-600">Buscando compañer@... tus amigos verán que quieres ir en pareja</Text>
                  </View>
                )}
                {twoxState === 'matched' && (
                  <View className="gap-2">
                    <Text className="text-xs font-semibold text-green-700">¡Emparejad@! Coordinen el pago juntos.</Text>
                    {isMyTurnToPay2x ? (
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => {
                            const enrollId = twoxRequest?.enrollment_id
                            if (enrollId) router.push(`/(app)/payment/${enrollId}` as any)
                          }}
                          className="flex-row items-center gap-1.5 bg-brand-600 rounded-full px-3 py-1.5"
                        >
                          <ArrowRight size={14} stroke="white" />
                          <Text className="text-xs font-semibold text-white">Ir a pagar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handle2xTransferPayment}
                          disabled={twoxActing}
                          className="flex-row items-center gap-1.5 border border-gray-200 rounded-full px-3 py-1.5"
                        >
                          {twoxActing && <ActivityIndicator size="small" color="#6B6880" />}
                          <Text className="text-xs text-gray-600">Que pague mi compañer@</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text className="text-xs text-gray-500">Tu compañer@ tiene el turno de pago</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      {showDates && isCustom && (
        <CustomDatesModal
          dates={cls.custom_dates ?? []}
          time={cls.recurring_time}
          onClose={() => setShowDates(false)}
        />
      )}

      {showDiscountModal && isTeacher && token && (
        <DiscountModal
          classId={cls.id}
          classType={cls.type}
          currentPrice={cls.price}
          currentPriceSuelta={cls.price_suelta ?? null}
          currentDiscountPrice={discountData.discount_price}
          currentDiscountPriceMonthly={discountData.discount_price_monthly}
          token={token}
          onClose={() => setShowDiscountModal(false)}
          onSaved={(dp, dpm) => {
            setDiscountData({ discount_price: dp, discount_price_monthly: dpm })
            setShowDiscountModal(false)
          }}
        />
      )}

      {showAuditionModal && userId && (
        <AuditionModal
          classId={cls.id}
          userId={userId}
          teacherId={cls.teacher_id}
          existing={myAudition ?? null}
          onClose={() => setShowAuditionModal(false)}
          onSubmitted={async () => {
            setAuditionSubmitted(true)
            setShowAuditionModal(false)
            // Reload audition data to reflect any edits
            const { data } = await (supabase as any)
              .from('auditions')
              .select('*')
              .eq('class_id', cls.id)
              .eq('applicant_id', userId)
              .maybeSingle()
            if (data) setMyAudition(data)
          }}
        />
      )}
    </SafeAreaView>
  )
}
