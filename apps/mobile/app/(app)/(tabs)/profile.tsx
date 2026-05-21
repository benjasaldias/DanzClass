import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, TouchableOpacity, ScrollView, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MapPin, Users, Music2, ShieldCheck, AtSign, Sun, Moon } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { canTeach } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import MobilePostCard from '../../../components/feed/MobilePostCard'
import { useTheme } from '../../../context/ThemeContext'

const TIER_LABELS: Record<string, string> = {
  none: 'Sin plan activo',
  basic: 'Plan Básico',
  teacher: 'Plan Profesor',
  pro: 'Plan Pro',
}

export default function ProfileScreen() {
  const router = useRouter()
  const { isDark, toggleTheme } = useTheme()
  const [profile, setProfile] = useState<any>(null)
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [userId, setUserId] = useState<string | null>(null)
  const [followers, setFollowers] = useState(0)
  const [trustCount, setTrustCount] = useState(0)
  const [classes, setClasses] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [showAllClasses, setShowAllClasses] = useState(false)
  const [showAllPosts, setShowAllPosts] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [profileRes, subRes, followersRes, trustRes, classesRes, postsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').single(),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        (supabase as any).from('trust_endorsements').select('endorser_id', { count: 'exact', head: true }).eq('endorsed_id', user.id),
        (supabase as any).from('classes').select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id,status)').eq('teacher_id', user.id).eq('status', 'active'),
        (supabase as any).from('posts').select('*, author:profiles!user_id(id, username, full_name, avatar_url)').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])

      setProfile(profileRes.data)
      setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
      setFollowers(followersRes.count ?? 0)
      setTrustCount(trustRes.count ?? 0)
      setClasses(classesRes.data ?? [])
      setPosts(postsRes.data ?? [])
    } catch {
      // profile fails silently; user sees empty screen with retry via pull-to-refresh
    }
  }, [])

  useFocusEffect(load)

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!profile) return null

  const initials = (profile.full_name ?? '')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  const tierLabel = TIER_LABELS[tier] ?? 'Sin plan'
  const tierColors = tier === 'none'
    ? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }
    : { bg: 'bg-brand-50', text: 'text-brand-700', border: 'border-brand-200' }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Profile header */}
        <View className="bg-white dark:bg-dark-surface px-4 py-6 gap-4 border-b border-gray-100 dark:border-dark-border">
          {/* Theme toggle */}
          <View className="absolute top-4 right-4 z-10">
            <TouchableOpacity
              onPress={toggleTheme}
              className="h-8 w-8 rounded-full bg-gray-100 dark:bg-dark-surface2 items-center justify-center"
            >
              {isDark
                ? <Sun size={16} stroke="#A39BBF" />
                : <Moon size={16} stroke="#6B6880" />}
            </TouchableOpacity>
          </View>
          {/* Avatar + name */}
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
                <Text className="text-xs text-gray-400 dark:text-dark-text2">{profile.city}</Text>
              </View>
            )}
            {profile.instagram_handle && (
              <View className="flex-row items-center gap-1">
                <AtSign size={12} stroke="#6B6880" />
                <Text className="text-xs text-gray-400 dark:text-dark-text2">@{profile.instagram_handle}</Text>
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
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{classes.length}</Text>
              <View className="flex-row items-center gap-1">
                <Music2 size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo dark:text-dark-text2">clases</Text>
              </View>
            </View>
            <View className="w-px bg-gray-100 dark:bg-dark-border" />
            <View className="items-center">
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{trustCount}</Text>
              <View className="flex-row items-center gap-1">
                <ShieldCheck size={11} stroke="#6B6880" />
                <Text className="text-xs text-gris-humo dark:text-dark-text2">confían</Text>
              </View>
            </View>
          </View>

          {/* Plan badge */}
          <View className={`self-center border rounded-full px-4 py-1.5 ${tierColors.bg} ${tierColors.border}`}>
            <Text className={`text-xs font-semibold ${tierColors.text}`}>{tierLabel}</Text>
          </View>

          {/* Dance styles */}
          {profile.styles_teaching?.length > 0 && (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide">Enseña</Text>
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
              <Text className="text-xs font-semibold text-gris-humo dark:text-dark-text2 uppercase tracking-wide">Baila</Text>
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

        {/* Action pills */}
        <View className="mx-4 mt-4 flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={() => router.push('/(app)/profile/edit' as any)}
            className="border border-gray-200 dark:border-dark-border rounded-full px-4 py-2 bg-white dark:bg-dark-surface"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-dark-text2">Editar perfil</Text>
          </TouchableOpacity>

          {canTeach(tier) && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/profile/payment-info' as any)}
              className="border border-gray-200 dark:border-dark-border rounded-full px-4 py-2 bg-white dark:bg-dark-surface"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-dark-text2">Datos transferencia</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.push('/(app)/plans' as any)}
            className="border border-brand-200 rounded-full px-4 py-2 bg-brand-50"
          >
            <Text className="text-sm font-semibold text-brand-700">Ver planes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            className="border border-red-100 rounded-full px-4 py-2 bg-white"
          >
            <Text className="text-sm font-semibold text-red-600">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>

        {/* Active classes */}
        {classes.length > 0 && (
          <View className="mt-4">
            <Text className="px-4 pb-2 text-sm font-bold text-gray-700 dark:text-dark-text2">
              Mis clases activas ({classes.length})
            </Text>
            {(showAllClasses ? classes : classes.slice(0, 5)).map((c: any) => (
              <MobileClassCard key={c.id} classData={c} currentUserId={userId ?? ''} compact />
            ))}
            {classes.length > 5 && !showAllClasses && (
              <TouchableOpacity
                onPress={() => setShowAllClasses(true)}
                className="mx-4 mt-2 py-2.5 border border-gray-200 dark:border-dark-border rounded-xl items-center bg-white dark:bg-dark-surface"
              >
                <Text className="text-sm text-brand-600 dark:text-brand-300 font-semibold">Ver todas ({classes.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Posts */}
        {posts.length > 0 && (
          <View className="mt-4">
            <Text className="px-4 pb-2 text-sm font-bold text-gray-700 dark:text-dark-text2">
              Mis publicaciones ({posts.length})
            </Text>
            {(showAllPosts ? posts : posts.slice(0, 5)).map((p: any) => (
              <MobilePostCard key={p.id} post={p} currentUserId={userId ?? ''} />
            ))}
            {posts.length > 5 && !showAllPosts && (
              <TouchableOpacity
                onPress={() => setShowAllPosts(true)}
                className="mx-4 mt-2 py-2.5 border border-gray-200 dark:border-dark-border rounded-xl items-center bg-white dark:bg-dark-surface"
              >
                <Text className="text-sm text-brand-600 dark:text-brand-300 font-semibold">Ver todas ({posts.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
