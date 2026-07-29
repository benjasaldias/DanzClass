import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, Calendar, MapPin, Clock, Users, Check, X, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react-native'
import { supabase } from '../../../../lib/supabase'
import { useTheme } from '../../../../context/ThemeContext'
import Avatar from '../../../../components/ui/Avatar'
import { WEB_URL } from '@danceclass/shared'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatRehearsalDate(rehearsal: any): string {
  if (rehearsal.date_mode === 'single' && rehearsal.rehearsal_date) {
    const [y, m, d] = rehearsal.rehearsal_date.split('-').map(Number)
    return `${d} de ${MONTHS_ES[m - 1]} ${y}`
  }
  if (rehearsal.date_mode === 'custom' && rehearsal.custom_dates?.length) {
    const sorted = [...rehearsal.custom_dates].sort()
    if (sorted.length === 1) {
      const [y, m, d] = sorted[0].split('-').map(Number)
      return `${d} de ${MONTHS_ES[m - 1]} ${y}`
    }
    return `${sorted.length} fechas seleccionadas`
  }
  if (rehearsal.date_mode === 'coordinate' && rehearsal.coordinate_month) {
    const [y, m] = rehearsal.coordinate_month.split('-').map(Number)
    return `Coordinando para ${MONTHS_ES[m - 1]} ${y}`
  }
  return 'Fecha por coordinar'
}

export default function RehearsalDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [rehearsal, setRehearsal] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState<string | null>(null)
  const [showCustomDates, setShowCustomDates] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.back(); return }
      setUserId(user.id)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) setToken(session.access_token)

      const { data } = await (supabase as any)
        .from('rehearsals')
        .select(`
          *,
          creator:profiles!creator_id(id, username, full_name, avatar_url),
          invites:rehearsal_invites(
            id, user_id, status,
            user:profiles!user_id(id, username, full_name, avatar_url)
          )
        `)
        .eq('id', id)
        .eq('status', 'active')
        .single()

      if (!data) { router.back(); return }
      const myInvite = (data.invites ?? []).find((i: any) => i.user_id === user.id) ?? null
      setRehearsal({ ...data, my_invite: myInvite })
      setLocalStatus(myInvite?.status ?? null)
      setLoading(false)
    }
    load()
  }, [id])

  async function handleRespond(status: 'accepted' | 'rejected') {
    if (!rehearsal?.my_invite) return
    setResponding(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${WEB_URL}/api/rehearsal/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ invite_id: rehearsal.my_invite.id, status }),
      })
      if (res.ok) setLocalStatus(status)
    } finally {
      setResponding(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#7F77DD" size="large" />
      </SafeAreaView>
    )
  }

  if (!rehearsal) return null

  const isCreator = rehearsal.creator_id === userId
  const invites: any[] = rehearsal.invites ?? []
  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length
  const dateLabel = formatRehearsalDate(rehearsal)
  const customDatesSorted = rehearsal.date_mode === 'custom' ? [...(rehearsal.custom_dates ?? [])].sort() : []

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="p-1.5 rounded-lg">
          <ArrowLeft size={20} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="flex-1 text-base font-semibold text-gray-900 dark:text-dark-text" numberOfLines={1}>
          {rehearsal.title}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Group chat button — for creator and accepted invitees */}
        {(isCreator || localStatus === 'accepted') && (
          <TouchableOpacity
            onPress={async () => {
              if (!token) return
              const res = await fetch(`${WEB_URL}/api/chat/get-or-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ type: 'rehearsal', rehearsal_id: id }),
              })
              if (res.ok) {
                const { chat_id } = await res.json()
                router.push(`/(app)/chat/${chat_id}` as any)
              }
            }}
            className="flex-row items-center justify-between bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-900/40 rounded-2xl p-4"
          >
            <View className="flex-row items-center gap-2">
              <MessageCircle stroke={isDark ? '#c4b5fd' : '#7c3aed'} size={20} />
              <View>
                <Text className="text-sm font-semibold text-violet-900 dark:text-violet-200">Chat grupal</Text>
                <Text className="text-xs text-violet-600 dark:text-violet-400">Coordinación del ensayo</Text>
              </View>
            </View>
            <View className="bg-violet-600 rounded-xl px-3 py-1.5 flex-row items-center gap-1.5">
              <MessageCircle stroke="white" size={12} />
              <Text className="text-xs font-semibold text-white">Abrir</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Header card */}
        <View className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden border border-gray-100 dark:border-dark-border">
          <View style={{ height: 4, backgroundColor: '#7F77DD' }} />
          <View className="p-4">
            <View className="rounded-full self-start px-2 py-0.5 mb-2" style={{ backgroundColor: '#EEEDFE' }}>
              <Text style={{ color: '#534AB7', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Ensayo
              </Text>
            </View>
            <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">{rehearsal.title}</Text>
            {rehearsal.description ? (
              <Text className="mt-2 text-sm text-gray-600 dark:text-dark-text2 leading-relaxed">{rehearsal.description}</Text>
            ) : null}

            {/* Creator */}
            <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
              <Avatar url={rehearsal.creator?.avatar_url ?? null} name={rehearsal.creator?.full_name ?? ''} size="sm" />
              <View>
                <Text className="text-xs text-gris-humo dark:text-dark-text2">Organizado por</Text>
                <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">
                  {isCreator ? 'Ti (tú)' : `@${rehearsal.creator?.username}`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Date / location */}
        <View className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4 gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2">Cuándo y dónde</Text>

          <View className="flex-row items-start gap-3">
            <Calendar size={20} stroke="#7F77DD" style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">{dateLabel}</Text>
              {rehearsal.rehearsal_time ? (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Clock size={14} stroke={isDark ? '#A39BBF' : '#6B6880'} />
                  <Text className="text-xs text-gris-humo dark:text-dark-text2">
                    {rehearsal.rehearsal_time.slice(0, 5)}
                    {rehearsal.duration_minutes ? ` · ${rehearsal.duration_minutes} min` : ''}
                  </Text>
                </View>
              ) : null}
              {customDatesSorted.length > 1 ? (
                <TouchableOpacity
                  onPress={() => setShowCustomDates((v) => !v)}
                  className="flex-row items-center gap-1 mt-1.5"
                >
                  <Text style={{ color: '#7F77DD', fontSize: 12 }}>Ver todas las fechas</Text>
                  {showCustomDates
                    ? <ChevronUp size={12} stroke="#7F77DD" />
                    : <ChevronDown size={12} stroke="#7F77DD" />
                  }
                </TouchableOpacity>
              ) : null}
              {showCustomDates ? (
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {customDatesSorted.map((d: string) => {
                    const [y, m, day] = d.split('-').map(Number)
                    return (
                      <View key={d} className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#EEEDFE' }}>
                        <Text style={{ color: '#534AB7', fontSize: 11 }}>{day} {MONTHS_ES[m - 1].slice(0, 3)} {y}</Text>
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </View>
          </View>

          {(rehearsal.location || rehearsal.city) ? (
            <View className="flex-row items-start gap-3">
              <MapPin size={20} stroke="#7F77DD" style={{ marginTop: 2 }} />
              <View className="flex-1">
                {rehearsal.location ? (
                  <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">{rehearsal.location}</Text>
                ) : null}
                {rehearsal.city && rehearsal.city !== rehearsal.location ? (
                  <Text className="text-xs text-gris-humo dark:text-dark-text2">{rehearsal.city}</Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {/* RSVP */}
        {!isCreator && rehearsal.my_invite ? (
          <View className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-3">Tu respuesta</Text>
            {localStatus === 'pending' ? (
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => handleRespond('accepted')}
                  disabled={responding}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-2.5 bg-emerald-500"
                  style={{ opacity: responding ? 0.5 : 1 }}
                >
                  {responding ? <ActivityIndicator size="small" color="white" /> : <Check size={16} stroke="white" />}
                  <Text className="text-sm font-semibold text-white">Confirmar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRespond('rejected')}
                  disabled={responding}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-2.5 border border-gray-200 dark:border-dark-border"
                  style={{ opacity: responding ? 0.5 : 1 }}
                >
                  <X size={16} stroke={isDark ? '#EEEDFE' : '#374151'} />
                  <Text className="text-sm font-medium text-gray-600 dark:text-dark-text2">Rechazar</Text>
                </TouchableOpacity>
              </View>
            ) : localStatus === 'accepted' ? (
              <View className="flex-row items-center gap-2">
                <Check size={20} stroke="#16a34a" />
                <Text className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Confirmaste asistencia</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <X size={20} stroke={isDark ? '#A39BBF' : '#9CA3AF'} />
                <Text className="text-sm font-medium text-gray-400 dark:text-dark-text2">Rechazaste la invitación</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Invitees */}
        <View className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Users size={16} stroke={isDark ? '#A39BBF' : '#6B6880'} />
            <Text className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 flex-1">Integrantes</Text>
            <Text className="text-xs text-gris-humo dark:text-dark-text2">
              {acceptedCount} confirmado{acceptedCount !== 1 ? 's' : ''}
              {pendingCount > 0 ? `, ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}` : ''}
            </Text>
          </View>

          {invites.length === 0 ? (
            <Text className="text-sm text-gris-humo dark:text-dark-text2">Sin invitados aún</Text>
          ) : (
            <View className="gap-2.5">
              {invites.map((invite: any) => (
                <View key={invite.id} className="flex-row items-center gap-2.5">
                  <Avatar url={invite.user?.avatar_url ?? null} name={invite.user?.full_name ?? ''} size="sm" />
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-medium text-gray-900 dark:text-dark-text" numberOfLines={1}>
                      @{invite.user?.username}
                      {invite.user_id === userId ? ' (tú)' : ''}
                    </Text>
                  </View>
                  <View className={`rounded-full px-2 py-0.5 ${
                    invite.status === 'accepted'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20'
                      : invite.status === 'rejected'
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-yellow-50 dark:bg-yellow-900/20'
                  }`}>
                    <Text className={`text-[10px] font-semibold ${
                      invite.status === 'accepted'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : invite.status === 'rejected'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-yellow-700 dark:text-yellow-400'
                    }`}>
                      {invite.status === 'accepted' ? 'Confirmado' : invite.status === 'rejected' ? 'Rechazó' : 'Pendiente'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
