import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Calendar, MapPin, Clock, Users, Check, X, ChevronDown, ChevronUp } from 'lucide-react-native'
import Avatar from '../ui/Avatar'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'

const WEB_URL = 'https://dc-project-web.vercel.app'

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

interface Props {
  rehearsal: any
  currentUserId: string
  onUpdate?: () => void
}

export default function MobileRehearsalCard({ rehearsal, currentUserId, onUpdate }: Props) {
  const router = useRouter()
  const { isDark } = useTheme()
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState<string | null>(rehearsal.my_invite?.status ?? null)
  const [showInvites, setShowInvites] = useState(false)

  const isCreator = rehearsal.creator_id === currentUserId
  const myInvite = rehearsal.my_invite
  const invites: any[] = rehearsal.invites ?? []
  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length
  const dateLabel = formatRehearsalDate(rehearsal)

  async function handleRespond(status: 'accepted' | 'rejected') {
    if (!myInvite) return
    setResponding(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${WEB_URL}/api/rehearsal/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ invite_id: myInvite.id, status }),
      })
      if (res.ok) {
        setLocalStatus(status)
        onUpdate?.()
      }
    } finally {
      setResponding(false)
    }
  }

  return (
    <View className="bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border px-4 py-4">
      <View className="flex-row items-start gap-3">
        {/* Morado Flow accent bar */}
        <View className="w-1 rounded-full self-stretch flex-shrink-0 min-h-10" style={{ backgroundColor: '#7F77DD' }} />

        <View className="flex-1">
          {/* Badge */}
          <View className="flex-row items-center gap-2 mb-1">
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#EEEDFE' }}>
              <Text style={{ color: '#534AB7', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Ensayo
              </Text>
            </View>
          </View>

          {/* Title */}
          <TouchableOpacity onPress={() => router.push(`/(app)/rehearsal/${rehearsal.id}` as any)}>
            <Text className="text-base font-semibold text-gray-900 dark:text-dark-text leading-tight">
              {rehearsal.title}
            </Text>
          </TouchableOpacity>

          {/* Creator */}
          <View className="flex-row items-center gap-1.5 mt-1">
            <Avatar url={rehearsal.creator?.avatar_url ?? null} name={rehearsal.creator?.full_name ?? ''} size="xs" />
            <Text className="text-xs text-gris-humo dark:text-dark-text2">
              {isCreator ? 'Tú organizas' : `@${rehearsal.creator?.username}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Description */}
      {rehearsal.description ? (
        <Text className="mt-2 text-sm text-gray-700 dark:text-dark-text2 leading-relaxed ml-4">
          {rehearsal.description}
        </Text>
      ) : null}

      {/* Metadata */}
      <View className="mt-3 ml-4 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Calendar size={16} stroke="#7F77DD" />
          <Text className="text-sm text-gris-humo dark:text-dark-text2 flex-1">{dateLabel}</Text>
        </View>

        {rehearsal.rehearsal_time ? (
          <View className="flex-row items-center gap-1.5">
            <Clock size={14} stroke={isDark ? '#A39BBF' : '#6B6880'} />
            <Text className="text-sm text-gris-humo dark:text-dark-text2">
              {rehearsal.rehearsal_time.slice(0, 5)}
              {rehearsal.duration_minutes ? ` · ${rehearsal.duration_minutes} min` : ''}
            </Text>
          </View>
        ) : null}

        {(rehearsal.location || rehearsal.city) ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={16} stroke="#7F77DD" />
            <Text className="text-sm text-gris-humo dark:text-dark-text2 flex-1" numberOfLines={1}>
              {rehearsal.location ?? rehearsal.city}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Invitees toggle */}
      {invites.length > 0 ? (
        <View className="mt-3 ml-4">
          <TouchableOpacity
            onPress={() => setShowInvites((v) => !v)}
            className="flex-row items-center gap-2"
          >
            <Users size={14} stroke={isDark ? '#A39BBF' : '#6B6880'} />
            <Text className="text-xs text-gris-humo dark:text-dark-text2 flex-1">
              {acceptedCount > 0 ? `${acceptedCount} confirmado${acceptedCount !== 1 ? 's' : ''}` : ''}
              {acceptedCount > 0 && pendingCount > 0 ? ', ' : ''}
              {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}` : ''}
            </Text>
            {showInvites
              ? <ChevronUp size={12} stroke={isDark ? '#A39BBF' : '#6B6880'} />
              : <ChevronDown size={12} stroke={isDark ? '#A39BBF' : '#6B6880'} />
            }
          </TouchableOpacity>

          {showInvites ? (
            <View className="mt-2 gap-1.5">
              {invites.map((invite: any) => (
                <View key={invite.id} className="flex-row items-center gap-2">
                  <Avatar url={invite.user?.avatar_url ?? null} name={invite.user?.full_name ?? ''} size="xs" />
                  <Text className="text-xs text-gray-700 dark:text-dark-text2 flex-1">@{invite.user?.username}</Text>
                  <View className={`rounded-full px-2 py-0.5 ${
                    invite.status === 'accepted'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20'
                      : invite.status === 'rejected'
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-yellow-50 dark:bg-yellow-900/20'
                  }`}>
                    <Text className={`text-[10px] font-medium ${
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
          ) : null}
        </View>
      ) : null}

      {/* RSVP actions for invitees */}
      {!isCreator && myInvite ? (
        <View className="mt-3 ml-4">
          {localStatus === 'pending' ? (
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-gray-600 dark:text-dark-text2">¿Vas?</Text>
              <TouchableOpacity
                onPress={() => handleRespond('accepted')}
                disabled={responding}
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 bg-emerald-500"
                style={{ opacity: responding ? 0.5 : 1 }}
              >
                {responding
                  ? <ActivityIndicator size="small" color="white" />
                  : <Check size={14} stroke="white" />
                }
                <Text className="text-xs font-semibold text-white ml-1">Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRespond('rejected')}
                disabled={responding}
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border border-gray-200 dark:border-dark-border"
                style={{ opacity: responding ? 0.5 : 1 }}
              >
                <X size={14} stroke={isDark ? '#EEEDFE' : '#374151'} />
                <Text className="text-xs font-medium text-gray-600 dark:text-dark-text2 ml-1">Rechazar</Text>
              </TouchableOpacity>
            </View>
          ) : localStatus === 'accepted' ? (
            <View className="flex-row items-center gap-1.5">
              <Check size={14} stroke="#16a34a" />
              <Text className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Confirmaste asistencia</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1.5">
              <X size={14} stroke={isDark ? '#A39BBF' : '#9CA3AF'} />
              <Text className="text-xs font-medium text-gray-400 dark:text-dark-text2">Rechazaste la invitación</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}
