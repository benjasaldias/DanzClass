import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, MapPin, Users, UserPlus, UserCheck, UserMinus, ShieldCheck, Music2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import MobilePostCard from '../../../components/feed/MobilePostCard'

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

export default function TeacherProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  // Stats
  const [followers, setFollowers] = useState(0)
  const [trustCount, setTrustCount] = useState(0)
  const [classesCount, setClassesCount] = useState(0)
  const [classes, setClasses] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])

  // Social
  const [isFollowing, setIsFollowing] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [loadingFriend, setLoadingFriend] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? null
      setCurrentUserId(uid)

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

      if (!p) { setLoading(false); return }
      setProfile(p)
      setIsOwnProfile(uid === p.id)

      const [followersRes, trustRes, classesRes, followRes, friendRes, postsRes] = await Promise.all([
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', p.id),
        (supabase as any).from('trust_endorsements').select('endorser_id', { count: 'exact', head: true }).eq('endorsed_id', p.id),
        (supabase as any).from('classes').select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id,status)').eq('teacher_id', p.id).eq('status', 'active'),
        uid ? supabase.from('follows').select('follower_id').eq('follower_id', uid).eq('following_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
        uid && uid !== p.id
          ? supabase.from('friendships')
            .select('*')
            .or(`and(requester_id.eq.${uid},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${uid})`)
            .maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase as any).from('posts').select('*, author:profiles!user_id(id, username, full_name, avatar_url)').eq('user_id', p.id).order('created_at', { ascending: false }),
      ])

      setFollowers(followersRes.count ?? 0)
      setTrustCount(trustRes.count ?? 0)
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
    }
    load()
  }, [username])

  async function handleFollowToggle() {
    if (!currentUserId || !profile) return
    setLoadingFollow(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id)
      setFollowers((f) => f - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: profile.id })
      await supabase.from('notifications').insert({ user_id: profile.id, type: 'follow', data: { from_user_id: currentUserId } })
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
      await supabase.from('notifications').insert({ user_id: profile.id, type: 'friend_request', data: { from_user_id: currentUserId } })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      await supabase.from('friendships').update({ status: 'accepted' })
        .eq('requester_id', profile.id).eq('addressee_id', currentUserId)
      await supabase.from('notifications').insert({ user_id: profile.id, type: 'friend_accepted', data: { from_user_id: currentUserId } })
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

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta">
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

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} stroke="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">@{profile.username}</Text>
      </View>

      <ScrollView className="flex-1">
        {/* Profile card */}
        <View className="bg-white px-4 py-6 gap-4 border-b border-gray-100">
          <View className="items-center gap-2">
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} className="w-20 h-20 rounded-full" />
            ) : (
              <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 text-2xl font-bold">{initials}</Text>
              </View>
            )}
            <Text className="text-xl font-bold text-gray-900">{profile.full_name}</Text>
            <Text className="text-gris-humo text-sm">@{profile.username}</Text>
            {profile.city && (
              <View className="flex-row items-center gap-1">
                <MapPin size={12} stroke="#6B6880" />
                <Text className="text-xs text-gray-400">{profile.city}</Text>
              </View>
            )}
            {profile.bio && <Text className="text-sm text-gray-600 text-center">{profile.bio}</Text>}
          </View>

          {/* Stats */}
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900">{followers}</Text>
              <View className="flex-row items-center gap-1">
                <Users size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo">seguidores</Text>
              </View>
            </View>
            <View className="w-px bg-gray-100" />
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900">{classesCount}</Text>
              <View className="flex-row items-center gap-1">
                <Music2 size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo">clases</Text>
              </View>
            </View>
            <View className="w-px bg-gray-100" />
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900">{trustCount}</Text>
              <View className="flex-row items-center gap-1">
                <ShieldCheck size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo">confían</Text>
              </View>
            </View>
          </View>

          {/* Social buttons (not own profile) */}
          {!isOwnProfile && (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleFollowToggle}
                disabled={loadingFollow}
                className={`flex-1 rounded-xl py-2.5 items-center border ${isFollowing ? 'border-brand-300 bg-brand-50' : 'border-brand-600 bg-brand-600'}`}
              >
                <Text className={`text-sm font-semibold ${isFollowing ? 'text-brand-700' : 'text-white'}`}>
                  {loadingFollow ? '...' : isFollowing ? 'Siguiendo' : 'Seguir'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleFriendAction}
                disabled={loadingFriend || friendStatus === 'pending_sent'}
                className={`flex-1 rounded-xl py-2.5 items-center border ${
                  friendStatus === 'accepted' ? 'border-green-300 bg-green-50' :
                  friendStatus === 'pending_received' ? 'border-morado-flow bg-morado-flow' :
                  'border-gray-200 bg-white'
                }`}
              >
                <Text className={`text-sm font-semibold ${
                  friendStatus === 'accepted' ? 'text-green-700' :
                  friendStatus === 'pending_received' ? 'text-white' :
                  'text-gray-700'
                }`}>
                  {loadingFriend ? '...' : friendButtonLabel()}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Dance styles */}
          {profile.styles_teaching?.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gris-humo uppercase tracking-wide">Enseña</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {profile.styles_teaching.map((s: string) => (
                  <View key={s} className="bg-brand-50 rounded-full px-3 py-1">
                    <Text className="text-xs text-brand-700 font-medium">{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {profile.styles_dancing?.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gris-humo uppercase tracking-wide">Baila</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {profile.styles_dancing.map((s: string) => (
                  <View key={s} className="bg-lavanda-suave rounded-full px-3 py-1">
                    <Text className="text-xs font-medium" style={{ color: '#534AB7' }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Active classes */}
        {classes.length > 0 && (
          <View className="mt-2">
            <Text className="px-4 py-3 text-sm font-bold text-gray-700">
              Clases activas ({classes.length})
            </Text>
            {classes.map((c: any) => (
              <MobileClassCard key={c.id} classData={c} currentUserId={currentUserId ?? ''} />
            ))}
          </View>
        )}

        {/* Posts */}
        {posts.length > 0 && (
          <View className="mt-2">
            <Text className="px-4 py-3 text-sm font-bold text-gray-700">
              Publicaciones ({posts.length})
            </Text>
            {posts.map((p: any) => (
              <MobilePostCard key={p.id} post={p} currentUserId={currentUserId ?? ''} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
