import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image, Alert, Modal, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, MapPin, Users, Music2, Star } from 'lucide-react-native'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { sendNotifications } from '../../../lib/notifications'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import MobilePostCard from '../../../components/feed/MobilePostCard'
import StarRating from '../../../components/ui/StarRating'
import StyleChip from '../../../components/ui/StyleChip'
import { useTheme } from '../../../context/ThemeContext'

function classSessionHasEnded(cls: any, enrollmentCreatedAt: string): boolean {
  const now = new Date()
  const enrolledAt = new Date(enrollmentCreatedAt)
  if (cls.type === 'suelta') {
    if (!cls.date || !cls.time) return false
    const [h, m] = (cls.time as string).split(':').map(Number)
    const end = new Date(`${cls.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
    end.setMinutes(end.getMinutes() + (cls.duration_minutes ?? 60))
    return end < now
  }
  if (cls.recurrence === 'custom' || (cls.custom_dates && cls.custom_dates.length > 0)) {
    const time = cls.recurring_time ?? '00:00'
    const [h, m] = time.split(':').map(Number)
    return (cls.custom_dates ?? []).some((d: string) => {
      const end = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      end.setMinutes(end.getMinutes() + (cls.duration_minutes ?? 60))
      return end < now && new Date(`${d}T00:00:00`) >= enrolledAt
    })
  }
  if (cls.day_of_week != null && cls.recurring_time) {
    const [h, m] = (cls.recurring_time as string).split(':').map(Number)
    const today = new Date()
    const daysBack = (today.getDay() - cls.day_of_week + 7) % 7
    const candidate = new Date(today)
    candidate.setDate(today.getDate() - (daysBack === 0 ? 7 : daysBack))
    candidate.setHours(h, m, 0, 0)
    candidate.setMinutes(candidate.getMinutes() + (cls.duration_minutes ?? 60))
    if (candidate >= now) candidate.setDate(candidate.getDate() - 7)
    return candidate < now && candidate >= enrolledAt
  }
  return false
}

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

export default function TeacherProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>()
  const router = useRouter()
  const { isDark } = useTheme()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  // Stats
  const [followers, setFollowers] = useState(0)
  const [avgStars, setAvgStars] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [myRating, setMyRating] = useState<number | null>(null)
  const [canRate, setCanRate] = useState(false)
  const [classesCount, setClassesCount] = useState(0)
  const [classes, setClasses] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [showAllClasses, setShowAllClasses] = useState(false)
  const [showAllPosts, setShowAllPosts] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Rating modal
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [ratingSelected, setRatingSelected] = useState(0)
  const [ratingLoading, setRatingLoading] = useState(false)

  // Social
  const [isFollowing, setIsFollowing] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [loadingFriend, setLoadingFriend] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? null
      setCurrentUserId(uid)

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .eq('is_confirmed' as any, true)
        .single()

      if (!p) { setLoading(false); return }
      setProfile(p)
      setIsOwnProfile(uid === p.id)

      const [followersRes, ratingsRes, myRatingRes, classesRes, followRes, friendRes, postsRes, pastEnrollmentsRes] = await Promise.all([
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', p.id),
        (supabase as any).from('ratings').select('stars').eq('rated_user_id', p.id),
        uid && uid !== p.id
          ? (supabase as any).from('ratings').select('stars').eq('rater_id', uid).eq('rated_user_id', p.id).maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any).from('classes').select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id,status)').eq('teacher_id', p.id).eq('status', 'active'),
        uid ? supabase.from('follows').select('follower_id').eq('follower_id', uid).eq('following_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
        uid && uid !== p.id
          ? supabase.from('friendships')
            .select('*')
            .or(`and(requester_id.eq.${uid},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${uid})`)
            .maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any).from('posts').select('*, author:profiles!user_id(id, username, full_name, avatar_url)').eq('user_id', p.id).is('plan_hidden_at', null).order('created_at', { ascending: false }),
        uid && uid !== p.id
          ? (supabase as any).from('enrollments')
              .select('created_at, class:classes!inner(id, type, date, time, duration_minutes, recurrence, day_of_week, recurring_time, custom_dates)')
              .eq('student_id', uid)
              .eq('status', 'confirmed')
              .eq('class.teacher_id', p.id)
              .limit(20)
          : Promise.resolve({ data: [] }),
      ])

      setFollowers(followersRes.count ?? 0)
      // Ratings
      const ratingRows = ratingsRes.data ?? []
      const rc = ratingRows.length
      setRatingCount(rc)
      setAvgStars(rc > 0 ? Math.round((ratingRows.reduce((s: number, r: any) => s + Number(r.stars), 0) / rc) * 10) / 10 : 0)
      setMyRating(myRatingRes.data?.stars ? Number(myRatingRes.data.stars) : null)
      setRatingSelected(myRatingRes.data?.stars ? Number(myRatingRes.data.stars) : 0)
      const pastEnrollments = pastEnrollmentsRes.data ?? []
      setCanRate(uid !== p.id && pastEnrollments.some((e: any) => classSessionHasEnded(e.class, e.created_at)))

      setClasses(classesRes.data ?? [])
      setClassesCount(classesRes.data?.length ?? 0)
      setIsFollowing(!!followRes.data)

      const friendRow = friendRes.data
      if (!friendRow) {
        setFriendStatus('none')
      } else if (friendRow.status === 'accepted') {
        setFriendStatus('accepted')
      } else if (friendRow.requester_id === uid) {
        setFriendStatus('pending_sent')
      } else {
        setFriendStatus('pending_received')
      }

      // Filter posts by visibility based on relationship
      const isFriend = friendRow?.status === 'accepted'
      const isFollowingNow = !!followRes.data
      const allPosts = postsRes.data ?? []
      const filteredPosts = uid === p.id
        ? allPosts
        : allPosts.filter((post: any) => {
          if (post.visibility === 'public') return true
          if (post.visibility === 'followers' && (isFollowingNow || isFriend)) return true
          if (post.visibility === 'friends' && isFriend) return true
          return false
        })
      setPosts(filteredPosts)

      setLoading(false)
      setRefreshing(false)
    } catch {
      setLoading(false)
      setRefreshing(false)
    }
  }, [username])

  useEffect(() => { load() }, [load])

  async function handleFollowToggle() {
    if (!currentUserId || !profile) return
    setLoadingFollow(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id)
      setFollowers((f) => f - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: profile.id })
      await sendNotifications({ user_id: profile.id, type: 'follow', data: { from_user_id: currentUserId } })
      setFollowers((f) => f + 1)
    }
    setIsFollowing(!isFollowing)
    setLoadingFollow(false)
  }

  async function handleFriendAction() {
    if (!currentUserId || !profile) return
    if (friendStatus === 'accepted') {
      Alert.alert('Eliminar amistad', '¿Seguro que quieres terminar la amistad?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            setLoadingFriend(true)
            await supabase.from('friendships').delete()
              .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${currentUserId})`)
            setFriendStatus('none')
            setLoadingFriend(false)
          },
        },
      ])
      return
    }
    setLoadingFriend(true)
    if (friendStatus === 'none') {
      await supabase.from('friendships').insert({ requester_id: currentUserId, addressee_id: profile.id, status: 'pending' })
      await sendNotifications({ user_id: profile.id, type: 'friend_request', data: { from_user_id: currentUserId } })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      await supabase.from('friendships').update({ status: 'accepted' })
        .eq('requester_id', profile.id).eq('addressee_id', currentUserId)
      await sendNotifications({ user_id: profile.id, type: 'friend_accepted', data: { from_user_id: currentUserId } })
      setFriendStatus('accepted')
    }
    setLoadingFriend(false)
  }

  const friendButtonLabel = () => {
    if (friendStatus === 'accepted') return 'Amig@s'
    if (friendStatus === 'pending_sent') return 'Solicitud enviada'
    if (friendStatus === 'pending_received') return 'Aceptar solicitud'
    return 'Enviar solicitud'
  }

  async function handleSubmitRating() {
    if (!currentUserId || !profile || ratingSelected < 1) return
    setRatingLoading(true)
    const isEdit = myRating !== null
    if (isEdit) {
      await (supabase as any).from('ratings').update({ stars: ratingSelected }).eq('rater_id', currentUserId).eq('rated_user_id', profile.id)
    } else {
      await (supabase as any).from('ratings').insert({ rater_id: currentUserId, rated_user_id: profile.id, stars: ratingSelected })
    }
    const newCount = isEdit ? ratingCount : ratingCount + 1
    const newAvg = isEdit
      ? Math.round(((avgStars * ratingCount - (myRating ?? 0) + ratingSelected) / ratingCount) * 10) / 10
      : Math.round(((avgStars * ratingCount + ratingSelected) / newCount) * 10) / 10
    setMyRating(ratingSelected)
    setRatingCount(newCount)
    setAvgStars(newAvg)
    setRatingLoading(false)
    setShowRatingModal(false)
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <Text className="text-gray-500">Usuario no encontrado</Text>
      </SafeAreaView>
    )
  }

  const initials = profile.full_name
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const ratingLabels: Record<number, string> = {
    0.5: 'Muy malo', 1: 'Malo', 1.5: 'Malo', 2: 'Regular', 2.5: 'Regular',
    3: 'Bueno', 3.5: 'Bueno', 4: 'Muy bueno', 4.5: 'Excelente', 5: 'Excelente',
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="fade" onRequestClose={() => setShowRatingModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          <View className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface p-6" style={{ maxWidth: 360 }}>
            <View className="items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center mb-2">
                <Star size={20} stroke="#c026d3" />
              </View>
              <Text className="text-base font-bold text-gray-900 dark:text-dark-text">
                {myRating !== null ? 'Editar valoración' : 'Valorar profesor'}
              </Text>
              <Text className="text-sm text-gris-humo dark:text-dark-text2 mt-0.5">{profile?.full_name}</Text>
            </View>
            <View className="items-center gap-2 mb-4">
              <StarRating value={ratingSelected} onChange={setRatingSelected} size="lg" instanceId="rating-modal" />
              <Text className="text-xs text-gray-500 dark:text-dark-text2" style={{ minHeight: 16 }}>
                {ratingSelected > 0 ? ratingLabels[ratingSelected] ?? '' : 'Toca para valorar'}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleSubmitRating}
                disabled={ratingLoading || ratingSelected < 1}
                className="flex-1 rounded-xl bg-brand-600 py-3 items-center"
                style={{ opacity: ratingSelected < 1 ? 0.5 : 1 }}
              >
                <Text className="text-sm font-semibold text-white">
                  {ratingLoading ? '...' : myRating !== null ? 'Actualizar' : 'Publicar'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowRatingModal(false)}
                className="rounded-xl border border-gray-200 dark:border-dark-border px-4 py-3 items-center"
              >
                <Text className="text-sm text-gray-600 dark:text-dark-text2">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900 dark:text-dark-text">@{profile.username}</Text>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load() }}
            tintColor="#c026d3"
          />
        }
      >
        {/* Profile card */}
        <View className="bg-white dark:bg-dark-surface px-4 py-6 gap-4 border-b border-gray-100 dark:border-dark-border">
          <View className="items-center gap-2">
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} className="w-20 h-20 rounded-full" />
            ) : (
              <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 text-2xl font-bold">{initials}</Text>
              </View>
            )}
            <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">{profile.full_name}</Text>
            <Text className="text-gris-humo dark:text-dark-text2 text-sm">@{profile.username}</Text>
            {profile.city && (
              <View className="flex-row items-center gap-1">
                <MapPin size={12} stroke="#6B6880" />
                <Text className="text-xs text-gray-400 dark:text-dark-text2/60">{profile.city}</Text>
              </View>
            )}
            {profile.bio && <Text className="text-sm text-gray-600 dark:text-dark-text2 text-center">{profile.bio}</Text>}
          </View>

          {/* Stats */}
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{followers}</Text>
              <View className="flex-row items-center gap-1">
                <Users size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo dark:text-dark-text2">seguidores</Text>
              </View>
            </View>
            <View className="w-px bg-gray-100 dark:bg-dark-border" />
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{classesCount}</Text>
              <View className="flex-row items-center gap-1">
                <Music2 size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo dark:text-dark-text2">clases</Text>
              </View>
            </View>
            {ratingCount > 0 && (
              <>
                <View className="w-px bg-gray-100 dark:bg-dark-border" />
                <View className="items-center">
                  <Text className="text-lg font-bold" style={{ color: isDark ? '#e879f9' : '#c026d3' }}>{avgStars.toFixed(1)}</Text>
                  <StarRating value={avgStars} readOnly size="sm" instanceId="profile-stats" />
                  <Text className="text-xs text-gris-humo dark:text-dark-text2">{ratingCount} val.</Text>
                </View>
              </>
            )}
          </View>

          {/* Social buttons (not own profile) */}
          {!isOwnProfile && (
            <View className="gap-2">
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleFollowToggle}
                  disabled={loadingFollow}
                  className={`flex-1 rounded-xl py-2.5 items-center border ${isFollowing ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30' : 'border-brand-600 bg-brand-600'}`}
                >
                  <Text className={`text-sm font-semibold ${isFollowing ? 'text-brand-700' : 'text-white'}`}>
                    {loadingFollow ? '...' : isFollowing ? 'Siguiendo' : 'Seguir'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleFriendAction}
                  disabled={loadingFriend || friendStatus === 'pending_sent'}
                  className={`flex-1 rounded-xl py-2.5 items-center border ${
                    friendStatus === 'accepted' ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/30' :
                    friendStatus === 'pending_received' ? 'border-morado-flow bg-morado-flow' :
                    'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${
                    friendStatus === 'accepted' ? 'text-green-700 dark:text-green-400' :
                    friendStatus === 'pending_received' ? 'text-white' :
                    'text-gray-700 dark:text-dark-text2'
                  }`}>
                    {loadingFriend ? '...' : friendButtonLabel()}
                  </Text>
                </TouchableOpacity>
              </View>
              {canRate && (
                <TouchableOpacity
                  onPress={() => { setRatingSelected(myRating ?? 0); setShowRatingModal(true) }}
                  className={`rounded-xl py-2.5 items-center border flex-row justify-center gap-2 ${
                    myRating !== null
                      ? 'border-brand-200 bg-brand-50 dark:bg-brand-950/20 dark:border-brand-800'
                      : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2'
                  }`}
                >
                  <Star size={14} stroke={myRating !== null ? '#c026d3' : '#6B6880'} />
                  <Text className={`text-sm font-semibold ${myRating !== null ? 'text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-dark-text2'}`}>
                    {myRating !== null ? `Mi valoración: ${myRating}` : 'Valorar profesor'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Dance styles */}
          {profile.styles_teaching?.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide">Enseña</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {profile.styles_teaching.map((s: string) => (
                  <StyleChip key={s} style={s} />
                ))}
              </View>
            </View>
          )}
          {profile.styles_dancing?.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide">Baila</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {profile.styles_dancing.map((s: string) => (
                  <StyleChip key={s} style={s} />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Active classes */}
        <View className="mt-2">
          <Text className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-dark-text">
            Clases activas ({classes.length})
          </Text>
          {classes.length === 0 ? (
            <Text className="px-4 pb-4 text-sm text-gris-humo dark:text-dark-text2">No hay clases publicadas</Text>
          ) : (
            <>
              {(showAllClasses ? classes : classes.slice(0, 5)).map((c: any) => (
                <MobileClassCard key={c.id} classData={c} currentUserId={currentUserId ?? ''} />
              ))}
              {classes.length > 5 && !showAllClasses && (
                <TouchableOpacity
                  onPress={() => setShowAllClasses(true)}
                  className="mx-4 mt-2 py-2.5 border border-gray-200 dark:border-dark-border rounded-xl items-center"
                >
                  <Text className="text-sm text-brand-600 font-semibold">Ver todas ({classes.length})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Posts */}
        <View className="mt-2">
          <Text className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-dark-text">
            Publicaciones ({posts.length})
          </Text>
          {posts.length === 0 ? (
            <Text className="px-4 pb-4 text-sm text-gris-humo dark:text-dark-text2">No hay publicaciones</Text>
          ) : (
            <>
              {(showAllPosts ? posts : posts.slice(0, 5)).map((p: any) => (
                <MobilePostCard key={p.id} post={p} currentUserId={currentUserId ?? ''} />
              ))}
              {posts.length > 5 && !showAllPosts && (
                <TouchableOpacity
                  onPress={() => setShowAllPosts(true)}
                  className="mx-4 mt-2 py-2.5 border border-gray-200 dark:border-dark-border rounded-xl items-center"
                >
                  <Text className="text-sm text-brand-600 font-semibold">Ver todas ({posts.length})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
