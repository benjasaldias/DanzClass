import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, TouchableOpacity, ScrollView, Alert, Image, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MapPin, Users, Music2, AtSign, Sun, Moon, GraduationCap, Gift, Copy } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import StarRating from '../../../components/ui/StarRating'
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
  const [avgRating, setAvgRating] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [classes, setClasses] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [showAllClasses, setShowAllClasses] = useState(false)
  const [showAllPosts, setShowAllPosts] = useState(false)
  const [classesTaken, setClassesTaken] = useState(0)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [profileRes, subRes, followersRes, ratingsRes, classesRes, postsRes, takenRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').single(),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        (supabase as any).from('ratings').select('stars').eq('rated_user_id', user.id),
        (supabase as any).from('classes').select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id,status)').eq('teacher_id', user.id).eq('status', 'active'),
        (supabase as any).from('posts').select('*, author:profiles!user_id(id, username, full_name, avatar_url)').eq('user_id', user.id).order('created_at', { ascending: false }),
        (supabase as any).from('enrollments').select('*', { count: 'exact', head: true }).eq('student_id', user.id).eq('status', 'confirmed'),
      ])

      const ratingRows: any[] = ratingsRes.data ?? []
      const count = ratingRows.length
      const avg = count > 0
        ? Math.round((ratingRows.reduce((a: number, r: any) => a + Number(r.stars), 0) / count) * 10) / 10
        : 0

      setProfile(profileRes.data)
      setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
      setFollowers(followersRes.count ?? 0)
      setRatingCount(count)
      setAvgRating(avg)
      setClasses(classesRes.data ?? [])
      setPosts(postsRes.data ?? [])
      setClassesTaken(takenRes.count ?? 0)
    } catch {
      // profile fails silently; user sees empty screen with retry via pull-to-refresh
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

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
    ? { bg: 'bg-gray-100 dark:bg-dark-surface2', text: 'text-gray-600 dark:text-dark-text2', border: 'border-gray-200 dark:border-dark-border' }
    : { bg: 'bg-brand-50 dark:bg-brand-950/30', text: 'text-brand-700 dark:text-brand-300', border: 'border-brand-200 dark:border-brand-900/50' }

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
              <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{classesTaken}</Text>
              <View className="flex-row items-center gap-1">
                <GraduationCap size={11} stroke={isDark ? '#A39BBF' : '#6B6880'} />
                <Text className="text-xs text-gris-humo dark:text-dark-text2">tomadas</Text>
              </View>
            </View>
            {canTeach(tier) && (
              <>
                <View className="w-px bg-gray-100 dark:bg-dark-border" />
                <View className="items-center">
                  <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{classes.length}</Text>
                  <View className="flex-row items-center gap-1">
                    <Music2 size={11} stroke="#6B6880" />
                    <Text className="text-xs text-gris-humo dark:text-dark-text2">dictadas</Text>
                  </View>
                </View>
                <View className="w-px bg-gray-100 dark:bg-dark-border" />
                <View className="items-center justify-center">
                  {ratingCount > 0
                    ? <StarRating value={avgRating} count={ratingCount} size="sm" />
                    : <Text className="text-xs text-gris-humo dark:text-dark-text2">Sin valoraciones</Text>
                  }
                </View>
              </>
            )}
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
                  <View key={s} className="bg-emerald-50 dark:bg-emerald-900/20 rounded-full px-3 py-1">
                    <Text className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{s}</Text>
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
                  <View key={s} className="bg-lavanda-suave dark:bg-dark-surface2 rounded-full px-3 py-1">
                    <Text className="text-xs font-medium" style={{ color: isDark ? '#A39BBF' : '#534AB7' }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Referral section */}
        {profile?.referral_code && (
          <View className="mx-4 mt-4 rounded-2xl border border-violet-200 dark:border-dark-border bg-violet-50/80 dark:bg-dark-surface p-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Gift size={16} stroke={isDark ? '#a78bfa' : '#7c3aed'} />
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">Invita un amigo</Text>
            </View>
            <Text className="text-xs text-gray-500 dark:text-dark-text2 mb-3 leading-5">
              Comparte tu código. Cuando tu amigo se suscriba por primera vez, ¡ambos reciben 1 mes Pro gratis!
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const appUrl = 'https://dc-project-web.vercel.app'
                const link = `${appUrl}/auth/register?ref=${profile.referral_code}`
                await Clipboard.setStringAsync(link)
                Alert.alert('¡Copiado!', 'El enlace de invitación fue copiado al portapapeles.')
              }}
              className="flex-row items-center justify-between rounded-xl bg-white dark:bg-dark-surface2 border border-violet-200 dark:border-dark-border px-3 py-2.5"
            >
              <Text className="text-xs text-gray-500 dark:text-dark-text2 flex-1 mr-2" numberOfLines={1}>
                dc-project-web.vercel.app/auth/register?ref={profile.referral_code}
              </Text>
              <View className="flex-row items-center gap-1">
                <Copy size={13} stroke={isDark ? '#a78bfa' : '#7c3aed'} />
                <Text className="text-xs font-semibold text-violet-600 dark:text-violet-400">Copiar</Text>
              </View>
            </TouchableOpacity>
            <Text className="text-[11px] text-gray-400 dark:text-dark-text2 mt-1.5">
              Tu código: <Text className="font-bold text-gray-600 dark:text-dark-text">{profile.referral_code}</Text>
            </Text>
          </View>
        )}

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

          <TouchableOpacity
            onPress={() => router.push('/(app)/profile/delete-account' as any)}
            className="px-2 py-1"
          >
            <Text className="text-xs text-red-400">Eliminar cuenta</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:contacto@danzclass.com?subject=Bug%20DanzClass')}
            className="px-2 py-1"
          >
            <Text className="text-xs text-violet-500">¿Encontraste algo raro? Reportar</Text>
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
