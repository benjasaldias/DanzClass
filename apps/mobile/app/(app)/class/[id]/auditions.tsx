import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
  Image, Alert, Linking,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '../../../../context/ThemeContext'
import {
  ChevronLeft, CheckCircle2, XCircle, Video, Send, Loader2,
} from 'lucide-react-native'
import { supabase } from '../../../../lib/supabase'
import { sendNotifications } from '../../../../lib/notifications'

const WEB_URL = 'https://dc-project-web.vercel.app'

interface Audition {
  id: string
  applicant_id: string
  full_name: string
  age: number | null
  phone: string | null
  video_url: string | null
  status: 'pending' | 'accepted' | 'rejected'
  notes: string | null
  created_at: string
  applicant: { username: string; full_name: string; avatar_url: string | null }
}

function AuditionCard({
  audition,
  localDecision,
  onAccept,
  onReject,
  onClear,
  showActions,
  onViewVideo,
}: {
  audition: Audition
  localDecision: 'accepted' | 'rejected' | null
  onAccept: () => void
  onReject: () => void
  onClear: () => void
  showActions: boolean
  onViewVideo: () => void
}) {
  const effectiveStatus = localDecision ?? audition.status
  const isDraft = localDecision !== null

  const statusBg: Record<string, string> = {
    pending: 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border',
    accepted: 'bg-green-50 border-green-200',
    rejected: 'bg-red-50 border-red-200',
  }

  return (
    <View className={`rounded-2xl border p-3 gap-2 ${statusBg[effectiveStatus]}`}>
      <View className="flex-row items-center gap-3">
        {audition.applicant?.avatar_url ? (
          <Image source={{ uri: audition.applicant.avatar_url }} className="w-9 h-9 rounded-full" />
        ) : (
          <View className="w-9 h-9 rounded-full bg-brand-100 items-center justify-center">
            <Text className="text-brand-700 text-sm font-bold">
              {(audition.full_name ?? '').split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </Text>
          </View>
        )}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text" numberOfLines={1}>{audition.full_name}</Text>
            {effectiveStatus !== 'pending' && (
              <View className={`rounded-full px-2 py-0.5 ${effectiveStatus === 'accepted' ? 'bg-green-100' : 'bg-red-100'}`}>
                <Text className={`text-xs font-medium ${effectiveStatus === 'accepted' ? 'text-green-700' : 'text-red-600'}`}>
                  {effectiveStatus === 'accepted' ? 'Aceptada' : 'Rechazada'}{isDraft ? ' (borrador)' : ''}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-gris-humo dark:text-dark-text2">@{audition.applicant?.username}</Text>
          <View className="flex-row gap-3 mt-0.5">
            {audition.age != null && <Text className="text-xs text-gray-400">{audition.age} años</Text>}
            {audition.phone && <Text className="text-xs text-gray-400">{audition.phone}</Text>}
          </View>
        </View>
        {audition.video_url && (
          <TouchableOpacity
            onPress={onViewVideo}
            className="flex-row items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1.5"
          >
            <Video size={14} stroke="#c026d3" />
            <Text className="text-xs font-medium text-brand-700">Ver</Text>
          </TouchableOpacity>
        )}
      </View>

      {showActions && audition.status === 'pending' && (
        <View className="flex-row gap-2">
          {localDecision === null ? (
            <>
              <TouchableOpacity
                onPress={onAccept}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2"
              >
                <CheckCircle2 size={14} stroke="white" />
                <Text className="text-xs font-semibold text-white">Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onReject}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2"
              >
                <XCircle size={14} stroke="#dc2626" />
                <Text className="text-xs font-semibold text-red-600">Rechazar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={onClear}
              className="flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-2"
            >
              <Text className="text-xs font-medium text-gray-600 dark:text-dark-text2">Deshacer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  )
}

export default function AuditionsScreen() {
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cls, setCls] = useState<any>(null)
  const [auditions, setAuditions] = useState<Audition[]>([])
  const [auditionClosed, setAuditionClosed] = useState(false)
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [publishing, setPublishing] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    async function load() {
      const [clsRes, auditionsRes] = await Promise.all([
        (supabase as any).from('classes').select('id, title, audition_closed').eq('id', id).single(),
        (supabase as any)
          .from('auditions')
          .select('*, applicant:profiles!applicant_id(username, full_name, avatar_url)')
          .eq('class_id', id)
          .order('created_at', { ascending: false }),
      ])
      setCls(clsRes.data)
      setAuditionClosed(clsRes.data?.audition_closed ?? false)
      setAuditions((auditionsRes.data as Audition[]) ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  function setDecision(auditionId: string, decision: 'accepted' | 'rejected') {
    setLocalDecisions((prev) => ({ ...prev, [auditionId]: decision }))
  }

  function clearDecision(auditionId: string) {
    setLocalDecisions((prev) => {
      const next = { ...prev }
      delete next[auditionId]
      return next
    })
  }

  async function handleViewVideo(videoUrl: string) {
    const path = videoUrl.includes('/audition-videos/')
      ? videoUrl.split('/audition-videos/')[1]
      : videoUrl
    const { data, error } = await supabase.storage.from('audition-videos').createSignedUrl(path, 3600)
    if (data?.signedUrl) {
      Linking.openURL(data.signedUrl)
    } else {
      Alert.alert('Error', 'No se pudo generar el enlace al video. Intenta de nuevo.')
    }
  }

  async function enrollAccepted(toPublish: Audition[]) {
    const acceptedIds = toPublish
      .filter((a) => localDecisions[a.id] === 'accepted')
      .map((a) => a.applicant_id)
    if (acceptedIds.length === 0) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${WEB_URL}/api/class/auditions/enroll-accepted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ classId: id, applicantIds: acceptedIds }),
    })
  }

  async function handlePublish() {
    const pending = auditions.filter((a) => a.status === 'pending')
    const toPublish = pending.filter((a) => localDecisions[a.id])
    if (toPublish.length === 0) return

    setPublishing(true)
    await Promise.all(
      toPublish.map((a) =>
        (supabase as any).from('auditions').update({ status: localDecisions[a.id] }).eq('id', a.id)
      )
    )
    const accepted = toPublish.filter((a) => localDecisions[a.id] === 'accepted')
    const rejected = toPublish.filter((a) => localDecisions[a.id] === 'rejected')
    if (accepted.length > 0) {
      await sendNotifications(accepted.map((a) => ({
        user_id: a.applicant_id,
        type: 'audition_accepted',
        data: { class_id: id, class_title: cls?.title ?? '' },
      })))
    }
    if (rejected.length > 0) {
      await sendNotifications(rejected.map((a) => ({
        user_id: a.applicant_id,
        type: 'audition_rejected',
        data: { class_id: id, class_title: cls?.title ?? '' },
      })))
    }
    await enrollAccepted(toPublish)
    setAuditions((prev) =>
      prev.map((a) => localDecisions[a.id] ? { ...a, status: localDecisions[a.id] } : a)
    )
    setLocalDecisions({})
    setPublishing(false)
  }

  async function handleCloseAuditions() {
    Alert.alert(
      'Cerrar postulaciones',
      '¿Confirmas cerrar las postulaciones? Las decisiones en borrador se publicarán automáticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar',
          style: 'destructive',
          onPress: async () => {
            setClosing(true)

            // Persist any draft decisions before closing
            const pending = auditions.filter((a) => a.status === 'pending')
            const toPublish = pending.filter((a) => localDecisions[a.id])

            if (toPublish.length > 0) {
              await Promise.all(
                toPublish.map((a) =>
                  (supabase as any).from('auditions').update({ status: localDecisions[a.id] }).eq('id', a.id)
                )
              )
              const acceptedC = toPublish.filter((a) => localDecisions[a.id] === 'accepted')
              const rejectedC = toPublish.filter((a) => localDecisions[a.id] === 'rejected')
              if (acceptedC.length > 0) {
                await sendNotifications(acceptedC.map((a) => ({
                  user_id: a.applicant_id,
                  type: 'audition_accepted',
                  data: { class_id: id, class_title: cls?.title ?? '' },
                })))
              }
              if (rejectedC.length > 0) {
                await sendNotifications(rejectedC.map((a) => ({
                  user_id: a.applicant_id,
                  type: 'audition_rejected',
                  data: { class_id: id, class_title: cls?.title ?? '' },
                })))
              }
              await enrollAccepted(toPublish)
              setAuditions((prev) =>
                prev.map((a) => localDecisions[a.id] ? { ...a, status: localDecisions[a.id] } : a)
              )
              setLocalDecisions({})
            }

            // Also enroll any previously-accepted auditions that may lack enrollment
            const alreadyAccepted = auditions.filter((a) => a.status === 'accepted')
            if (alreadyAccepted.length > 0) {
              const { data: { session } } = await supabase.auth.getSession()
              if (session) {
                await fetch(`${WEB_URL}/api/class/auditions/enroll-accepted`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ classId: id, applicantIds: alreadyAccepted.map((a) => a.applicant_id) }),
                })
              }
            }

            await (supabase as any).from('classes').update({ audition_closed: true }).eq('id', id)
            setAuditionClosed(true)
            setClosing(false)
          },
        },
      ]
    )
  }

  async function handleReopenAuditions() {
    Alert.alert(
      'Reabrir postulaciones',
      '¿Confirmas reabrir las postulaciones? Los resultados ya enviados no se modifican.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reabrir',
          onPress: async () => {
            setClosing(true)
            await (supabase as any).from('classes').update({ audition_closed: false }).eq('id', id)
            setAuditionClosed(false)
            setClosing(false)
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  const pendingAuditions = auditions.filter((a) => a.status === 'pending')
  const decidedAuditions = auditions.filter((a) => a.status !== 'pending')
  const pendingDecisionsCount = pendingAuditions.filter((a) => localDecisions[a.id]).length

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900 dark:text-dark-text">Postulaciones</Text>
          <Text className="text-xs text-gris-humo dark:text-dark-text2" numberOfLines={1}>{cls?.title}</Text>
        </View>
        {auditionClosed ? (
          <TouchableOpacity
            onPress={handleReopenAuditions}
            disabled={closing}
            className="flex-row items-center gap-1.5 rounded-xl border border-violet-300 dark:border-violet-700/40 bg-[#EEEDFE] dark:bg-dark-surface2 px-3 py-2"
          >
            {closing && <ActivityIndicator size="small" color="#534AB7" />}
            <Text className="text-xs font-semibold text-[#534AB7] dark:text-violet-300">Reabrir postulaciones</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleCloseAuditions}
            disabled={closing}
            className="flex-row items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
          >
            {closing && <ActivityIndicator size="small" color="#b45309" />}
            <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cerrar postulaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {auditionClosed && (
          <View className="mb-4 rounded-xl bg-gray-50 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border px-4 py-3">
            <Text className="text-sm text-gray-600 dark:text-dark-text2">Postulaciones cerradas — los resultados publicados fueron enviados a los postulantes. Puedes reabrir si necesitas recibir más postulaciones.</Text>
          </View>
        )}

        {auditions.length === 0 ? (
          <View className="items-center py-12">
            <Text className="text-sm text-gray-500 dark:text-dark-text2">Aún no hay postulaciones</Text>
          </View>
        ) : (
          <View className="gap-4">
            {pendingAuditions.length > 0 && (
              <View className="gap-2">
                <Text className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider">
                  Pendientes ({pendingAuditions.length})
                </Text>
                {pendingAuditions.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    localDecision={localDecisions[a.id] ?? null}
                    onAccept={() => setDecision(a.id, 'accepted')}
                    onReject={() => setDecision(a.id, 'rejected')}
                    onClear={() => clearDecision(a.id)}
                    showActions={!auditionClosed}
                    onViewVideo={() => a.video_url && handleViewVideo(a.video_url)}
                  />
                ))}
              </View>
            )}
            {decidedAuditions.length > 0 && (
              <View className="gap-2">
                <Text className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider">
                  Publicadas ({decidedAuditions.length})
                </Text>
                {decidedAuditions.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    localDecision={null}
                    onAccept={() => {}}
                    onReject={() => {}}
                    onClear={() => {}}
                    showActions={false}
                    onViewVideo={() => a.video_url && handleViewVideo(a.video_url)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky publish bar */}
      {!auditionClosed && pendingDecisionsCount > 0 && (
        <View className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <TouchableOpacity
            onPress={handlePublish}
            disabled={publishing}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-brand-600 py-3"
          >
            {publishing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Send size={16} stroke="white" />
            )}
            <Text className="text-sm font-semibold text-white">
              Publicar resultados ({pendingDecisionsCount} postulaci{pendingDecisionsCount === 1 ? 'ón' : 'ones'})
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}
