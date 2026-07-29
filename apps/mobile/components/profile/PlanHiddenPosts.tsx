import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Lock, Eye, Trash2, X } from 'lucide-react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { daysUntilPurge, postQuotaForTier, PLAN_HIDDEN_RETENTION_DAYS, WEB_URL } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface HiddenPost {
  id: string
  title: string
  video_url: string | null
  thumbnail_url: string | null
  plan_hidden_at: string | null
  [key: string]: any
}

interface Props {
  hiddenPosts: HiddenPost[]
  visiblePosts: HiddenPost[]
  tier: SubscriptionTier
  onChanged: () => void
}

function PostPreview({ url }: { url: string | null }) {
  const player = useVideoPlayer(url ?? '', (p) => { p.loop = false })
  if (!url) return <View className="w-full aspect-video bg-black rounded-xl" />
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }} contentFit="contain" />
}

/**
 * Biblioteca de videos ocultos por falta de plan (posts.plan_hidden_at != null).
 * Paridad con web: components/profile/PlanHiddenPosts.tsx.
 * Ver 060_post_plan_visibility.sql.
 */
export default function PlanHiddenPosts({ hiddenPosts, visiblePosts, tier, onChanged }: Props) {
  const router = useRouter()
  const { isDark } = useTheme()
  const [selected, setSelected] = useState<HiddenPost | null>(null)
  const [choosingDemote, setChoosingDemote] = useState(false)
  const [busy, setBusy] = useState(false)

  const quota = postQuotaForTier(tier)
  const atQuota = visiblePosts.length >= quota

  function close() {
    if (busy) return
    setSelected(null)
    setChoosingDemote(false)
  }

  async function expose(postId: string, demoteId?: string) {
    setBusy(true)
    const { error } = await (supabase as any).rpc('expose_post', {
      p_post_id: postId,
      p_demote_id: demoteId ?? null,
    })
    setBusy(false)
    if (error) {
      Alert.alert('No se pudo mostrar', 'Revisa tu plan e intenta de nuevo.')
      return
    }
    setSelected(null)
    setChoosingDemote(false)
    onChanged()
  }

  function confirmRemove(post: HiddenPost) {
    Alert.alert('Eliminar video', 'Se borrará definitivamente. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch(`${WEB_URL}/api/post/delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token ?? ''}`,
            },
            body: JSON.stringify({ postId: post.id }),
          })
          setBusy(false)
          if (!res.ok) {
            Alert.alert('Error', 'No se pudo eliminar el video.')
            return
          }
          setSelected(null)
          onChanged()
        },
      },
    ])
  }

  if (hiddenPosts.length === 0) return null

  const soonest = hiddenPosts
    .map((p) => daysUntilPurge(p.plan_hidden_at))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)[0]

  return (
    <View>
      <View className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 mb-2">
        <View className="flex-row gap-2">
          <Lock size={16} stroke={isDark ? '#fbbf24' : '#d97706'} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              {hiddenPosts.length === 1 ? '1 video privado por tu plan' : `${hiddenPosts.length} videos privados por tu plan`}
            </Text>
            <Text className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {quota === 0
                ? 'Sin plan activo, tus videos solo los ves tú. '
                : quota === Infinity
                  ? 'Tu plan no tiene límite de videos: puedes volver a mostrarlos todos. '
                  : `Tu plan cubre ${quota} ${quota === 1 ? 'video visible' : 'videos visibles'}. Los demás quedan aquí. `}
              Se eliminan {PLAN_HIDDEN_RETENTION_DAYS / 30} meses después de ocultarse
              {typeof soonest === 'number' && soonest > 0 ? ` (el primero, en ${soonest} ${soonest === 1 ? 'día' : 'días'})` : ''}.
            </Text>
            <TouchableOpacity onPress={() => router.push('/(app)/plans')} className="mt-1">
              <Text className="text-xs font-semibold text-amber-800 dark:text-amber-300 underline">Ver planes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap">
        {hiddenPosts.map((p) => {
          const days = daysUntilPurge(p.plan_hidden_at)
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => { setSelected(p); setChoosingDemote(false) }}
              className="w-1/3 aspect-square p-0.5"
            >
              <View className="flex-1 bg-gray-800 rounded-md items-center justify-center">
                <Lock size={18} stroke="#ffffff" />
                <Text className="text-[10px] text-white/80 mt-1" numberOfLines={1}>
                  {typeof days === 'number' ? (days > 0 ? `${days} d` : 'hoy') : ''}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={close}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white dark:bg-dark-surface rounded-t-3xl p-5 max-h-[85%]">
            <View className="flex-row items-start justify-between mb-3">
              <Text className="text-base font-bold text-gray-900 dark:text-dark-text flex-1 pr-3">
                {choosingDemote ? '¿Cuál guardas en privado?' : selected?.title}
              </Text>
              <TouchableOpacity onPress={close}>
                <X size={20} stroke={isDark ? '#EEEDFE' : '#374151'} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {!choosingDemote ? (
                <>
                  {selected && <PostPreview url={selected.video_url} />}

                  <Text className="text-xs text-gray-500 dark:text-dark-text2 my-3">
                    Solo tú puedes verlo.{' '}
                    {(() => {
                      const days = daysUntilPurge(selected?.plan_hidden_at ?? null)
                      return typeof days === 'number' && days > 0
                        ? `Se eliminará en ${days} ${days === 1 ? 'día' : 'días'} si sigue privado.`
                        : 'Se eliminará en la próxima limpieza si sigue privado.'
                    })()}
                  </Text>

                  {quota === 0 ? (
                    <TouchableOpacity
                      onPress={() => { close(); router.push('/(app)/plans') }}
                      className="bg-brand-600 rounded-xl py-3 items-center"
                    >
                      <Text className="text-white font-semibold text-sm">Activar un plan para publicarlo</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => (atQuota ? setChoosingDemote(true) : selected && expose(selected.id))}
                      className="bg-brand-600 rounded-xl py-3 flex-row items-center justify-center gap-2"
                      style={busy ? { opacity: 0.5 } : undefined}
                    >
                      {busy ? <ActivityIndicator color="#fff" /> : <Eye size={16} stroke="#ffffff" />}
                      <Text className="text-white font-semibold text-sm">
                        {atQuota ? 'Mostrar en vez de otro' : 'Mostrar en mi perfil'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => selected && confirmRemove(selected)}
                    className="mt-2 border border-red-200 dark:border-red-800 rounded-xl py-3 flex-row items-center justify-center gap-2"
                  >
                    <Trash2 size={16} stroke="#dc2626" />
                    <Text className="text-red-600 dark:text-red-400 font-medium text-sm">Eliminar definitivamente</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text className="text-xs text-gray-500 dark:text-dark-text2 mb-3">
                    Tu plan cubre {quota} {quota === 1 ? 'video visible' : 'videos visibles'}. El que elijas pasa a
                    privado (no se borra) y empieza su propio plazo de {PLAN_HIDDEN_RETENTION_DAYS / 30} meses.
                  </Text>
                  {visiblePosts.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      disabled={busy}
                      onPress={() => selected && expose(selected.id, v.id)}
                      className="flex-row items-center gap-3 border border-gray-200 dark:border-dark-border rounded-xl p-3 mb-2"
                    >
                      <Text className="flex-1 text-sm text-gray-800 dark:text-dark-text" numberOfLines={1}>{v.title}</Text>
                      {busy && <ActivityIndicator />}
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => setChoosingDemote(false)}
                    className="mt-1 border border-gray-200 dark:border-dark-border rounded-xl py-3 items-center"
                  >
                    <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Cancelar</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}
