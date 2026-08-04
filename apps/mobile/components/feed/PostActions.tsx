import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Heart, GraduationCap } from 'lucide-react-native'
import {
  loadPostInteractions,
  setPostLike,
  TEACH_REQUEST_LABEL,
  teachRequestSummary,
} from '@danceclass/shared'
import { supabase } from '../../lib/supabase'
import { setTeachRequest } from '../../lib/postInteractions'
import { useTheme } from '../../context/ThemeContext'

interface Props {
  postId: string
  authorId: string
  likesCount?: number | null
  teachRequestsCount?: number | null
  allowTeachRequests?: boolean | null
  currentUserId?: string | null
}

const RED = '#ef4444'
const MORADO_FLOW = '#7F77DD'

/** Espejo de components/feed/PostActions.tsx en web (ver 076_post_interactions.sql). */
export default function PostActions({
  postId,
  authorId,
  likesCount,
  teachRequestsCount,
  allowTeachRequests,
  currentUserId,
}: Props) {
  const router = useRouter()
  const { isDark } = useTheme()
  const isAuthor = !!currentUserId && currentUserId === authorId

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(Number(likesCount ?? 0))
  const [requested, setRequested] = useState(false)
  const [requests, setRequests] = useState(Number(teachRequestsCount ?? 0))
  const [teachPending, setTeachPending] = useState(false)
  const [teachError, setTeachError] = useState<string | null>(null)
  const beat = useRef(new Animated.Value(1)).current

  useEffect(() => {
    let alive = true
    if (!currentUserId) { setLiked(false); setRequested(false); return }
    loadPostInteractions(supabase, currentUserId, postId).then((flags) => {
      if (!alive) return
      setLiked(flags.liked)
      setRequested(flags.requested)
    })
    return () => { alive = false }
  }, [postId, currentUserId])

  function requireSession(): boolean {
    if (currentUserId) return true
    router.push('/(auth)/login' as any)
    return false
  }

  async function toggleLike() {
    if (!requireSession()) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    if (next) {
      Animated.sequence([
        Animated.spring(beat, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 14 }),
        Animated.spring(beat, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start()
    }
    const ok = await setPostLike(supabase, postId, currentUserId!, next)
    if (!ok) {
      setLiked(!next)
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
    }
  }

  async function toggleTeachRequest() {
    if (!requireSession()) return
    if (teachPending) return
    setTeachPending(true)
    setTeachError(null)
    const result = await setTeachRequest(postId, !requested)
    setTeachPending(false)
    if (!result.ok) { setTeachError(result.error); return }
    setRequested(result.requested)
    setRequests(result.count)
  }

  const showTeachButton = !!allowTeachRequests && !isAuthor
  const showTeachSummary = !!allowTeachRequests && isAuthor
  const idleText = isDark ? '#A39BBF' : '#6B6880'
  const idleBorder = isDark ? '#3D2870' : '#E5E7EB'

  return (
    <View className="px-4 pt-3 flex-row flex-wrap items-center gap-2">
      <TouchableOpacity
        onPress={toggleLike}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'}
        className="flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
        style={{
          borderColor: liked ? RED : idleBorder,
          backgroundColor: liked ? (isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2') : 'transparent',
        }}
      >
        <Animated.View style={{ transform: [{ scale: beat }] }}>
          <Heart size={16} stroke={liked ? RED : idleText} fill={liked ? RED : 'none'} />
        </Animated.View>
        {likes > 0 && (
          <Text className="text-sm font-medium" style={{ color: liked ? RED : idleText }}>{likes}</Text>
        )}
      </TouchableOpacity>

      {showTeachButton && (
        <TouchableOpacity
          onPress={toggleTeachRequest}
          activeOpacity={0.7}
          disabled={teachPending}
          accessibilityRole="button"
          className="flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
          style={{
            borderColor: MORADO_FLOW,
            backgroundColor: requested ? MORADO_FLOW : 'transparent',
            opacity: teachPending ? 0.6 : 1,
          }}
        >
          {teachPending
            ? <ActivityIndicator size="small" color={requested ? '#fff' : MORADO_FLOW} />
            : <GraduationCap size={16} stroke={requested ? '#fff' : MORADO_FLOW} />}
          <Text className="text-sm font-medium" style={{ color: requested ? '#fff' : MORADO_FLOW }}>
            {TEACH_REQUEST_LABEL}
          </Text>
          {requests > 0 && (
            <Text className="text-sm" style={{ color: requested ? '#fff' : MORADO_FLOW }}>{requests}</Text>
          )}
        </TouchableOpacity>
      )}

      {showTeachSummary && (
        <View
          className="flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
          style={{ borderColor: MORADO_FLOW, backgroundColor: isDark ? 'rgba(127,119,221,0.15)' : '#EEEDFE' }}
        >
          <GraduationCap size={16} stroke={MORADO_FLOW} />
          <Text className="text-sm" style={{ color: MORADO_FLOW }}>{teachRequestSummary(requests)}</Text>
        </View>
      )}

      {teachError && (
        <Text className="w-full text-xs text-red-600 dark:text-red-400">{teachError}</Text>
      )}
    </View>
  )
}
