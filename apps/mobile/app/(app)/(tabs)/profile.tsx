import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, TouchableOpacity, ScrollView, Alert, Image, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  AtSign, Gift, Copy, TrendingUp, CreditCard, MessageCircle,
  CalendarDays, ChevronRight, LogOut, Crown, Eye, Settings, Sun, Moon,
} from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import StyleChip from '../../../components/ui/StyleChip'
import ProfilePostsGrid from '../../../components/profile/ProfilePostsGrid'
import { supabase } from '../../../lib/supabase'
import { canTeach } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import { useTheme } from '../../../context/ThemeContext'

const TIER_LABELS: Record<string, string> = {
  none: 'Sin plan',
  basic: 'Plan Básico',
  teacher: 'Plan Profesor',
  pro: 'Plan Pro',
}

/* ── Helpers ──────────────────────────────────────────────── */

function SectionCard({ title, action, children, isDark }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; isDark: boolean
}) {
  return (
    <View
      className="mb-2.5 bg-white dark:bg-dark-surface"
      style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: isDark ? '#3D2870' : '#f3f4f6' }}
    >
      {title && (
        <View className="flex-row items-center justify-between px-4 pt-3.5 pb-1.5">
          <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-dark-text2">{title}</Text>
          {action}
        </View>
      )}
      {children}
    </View>
  )
}

function SettingRow({ icon: Icon, title, sub, onPress, isDark, right, danger, tintBg, tintStroke, isLast }: {
  icon: any; title: string; sub?: string; onPress?: () => void; isDark: boolean
  right?: React.ReactNode; danger?: boolean; tintBg?: string; tintStroke?: string; isLast?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center gap-3 px-4 py-3.5"
      style={isLast ? undefined : { borderBottomWidth: 1, borderBottomColor: isDark ? '#3D2870' : '#f3f4f6' }}
    >
      <View
        style={{
          width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          backgroundColor: tintBg ?? (danger ? (isDark ? '#3A1713' : '#FBE6E3') : (isDark ? '#2E1B5C' : '#EEEDFE')),
        }}
      >
        <Icon size={18} stroke={tintStroke ?? (danger ? (isDark ? '#FF6E60' : '#DC4438') : (isDark ? '#B3A6F8' : '#534AB7'))} />
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${danger ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-dark-text'}`}>{title}</Text>
        {sub && <Text className="text-xs text-gray-400 dark:text-dark-text2">{sub}</Text>}
      </View>
      {right !== undefined ? right : <ChevronRight size={18} stroke={isDark ? '#A39BBF' : '#cbd5e1'} />}
    </TouchableOpacity>
  )
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

  const isTeacher = canTeach(tier)
  const subActive = tier !== 'none'
  const border = isDark ? '#3D2870' : '#f3f4f6'

  // Stats: profesores 4, alumnos 2.
  const stats: { value: React.ReactNode; label: string }[] = isTeacher
    ? [
        { value: ratingCount > 0 ? <Text style={{ color: '#F59E0B', fontWeight: '700' }}>★ {avgRating}</Text> : '—', label: 'valoraciones' },
        { value: followers, label: 'seguidores' },
        { value: classesTaken, label: 'tomadas' },
        { value: classes.length, label: 'dictadas' },
      ]
    : [
        { value: classesTaken, label: 'tomadas' },
        { value: followers, label: 'seguidores' },
      ]

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <ScrollView className="flex-1">
        {/* ── Header ─────────────────────────────────────── */}
        <View className="bg-white dark:bg-dark-surface px-4 pt-6 pb-5 items-center" style={{ borderBottomWidth: 1, borderBottomColor: border }}>
          <View>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} className="w-20 h-20 rounded-full" />
            ) : (
              <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 text-2xl font-bold">{initials}</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#10B981', borderWidth: 3, borderColor: isDark ? '#241547' : '#fff' }} />
          </View>
          <Text className="mt-3 text-xl font-bold text-gray-900 dark:text-dark-text">{profile.full_name}</Text>
          <Text className="mt-0.5 text-gris-humo dark:text-dark-text2 text-sm">
            @{profile.username}{profile.city ? ` · ${profile.city}` : ''}
          </Text>
          {profile.bio && <Text className="mt-2 text-sm text-gray-600 dark:text-dark-text2 text-center">{profile.bio}</Text>}
          {profile.instagram_handle && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram_handle}`)}
              className="mt-2 flex-row items-center gap-1"
            >
              <AtSign size={13} stroke="#DB2777" />
              <Text className="text-sm text-pink-600">@{profile.instagram_handle}</Text>
            </TouchableOpacity>
          )}

          {/* stats */}
          <View className="mt-4 pt-4 flex-row w-full" style={{ borderTopWidth: 1, borderTopColor: border }}>
            {stats.map((s, i) => (
              <View key={i} className="flex-1 items-center" style={i < stats.length - 1 ? { borderRightWidth: 1, borderRightColor: border } : undefined}>
                {typeof s.value === 'object' ? s.value : <Text className="text-base font-bold text-gray-900 dark:text-dark-text">{s.value}</Text>}
                <Text className="mt-0.5 text-[11px] text-gray-400 dark:text-dark-text2">{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Suscripción (tappable) ───────────────────────── */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/plans' as any)}
          activeOpacity={0.8}
          className="flex-row items-center justify-between px-4 py-3.5 bg-white dark:bg-dark-surface"
          style={{ borderBottomWidth: 1, borderBottomColor: border }}
        >
          <View className="flex-row items-center gap-3">
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#2D1B69', alignItems: 'center', justifyContent: 'center' }}>
              <Crown size={20} stroke="#fff" />
            </View>
            <View>
              <View className="flex-row items-center gap-2">
                <Text className="font-bold text-gray-900 dark:text-dark-text">{TIER_LABELS[tier] ?? 'Sin plan'}</Text>
                {subActive && (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: isDark ? '#10331F' : '#DDF2E5' }}>
                    <Text className="text-[10px] font-bold" style={{ color: isDark ? '#45D389' : '#1E9D57' }}>Activo</Text>
                  </View>
                )}
              </View>
              <Text className="mt-0.5 text-xs text-gray-400 dark:text-dark-text2">Ver planes y beneficios</Text>
            </View>
          </View>
          <ChevronRight size={20} stroke={isDark ? '#A39BBF' : '#cbd5e1'} />
        </TouchableOpacity>

        {/* ── Acción primaria ──────────────────────────────── */}
        <View className="flex-row gap-2 px-4 py-3">
          <TouchableOpacity
            onPress={() => router.push('/(app)/profile/edit' as any)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-brand-600 dark:bg-morado-flow py-3"
          >
            <Settings size={16} stroke="#fff" />
            <Text className="text-sm font-semibold text-white">Editar perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/(app)/teacher/${profile.username}` as any)}
            className="w-12 items-center justify-center rounded-xl border bg-white dark:bg-dark-surface"
            style={{ borderColor: isDark ? '#3D2870' : '#e5e7eb' }}
          >
            <Eye size={20} stroke={isDark ? '#A39BBF' : '#6B6880'} />
          </TouchableOpacity>
        </View>

        {/* ── Gestión ──────────────────────────────────────── */}
        <SectionCard title="Gestión" isDark={isDark}>
          {isTeacher && (
            <SettingRow icon={TrendingUp} title="Panel Financiero" sub="Ingresos y estadísticas" isDark={isDark}
              tintBg={isDark ? '#10331F' : '#DDF2E5'} tintStroke={isDark ? '#45D389' : '#1E9D57'}
              onPress={() => router.push('/(app)/financiero' as any)} />
          )}
          {isTeacher && (
            <SettingRow icon={CreditCard} title="Datos de pago" sub="Para recibir transferencias" isDark={isDark}
              onPress={() => router.push('/(app)/profile/payment-info' as any)} />
          )}
          <SettingRow icon={MessageCircle} title="Mis chats" isDark={isDark}
            onPress={() => router.push('/(app)/chats' as any)} />
          <SettingRow icon={CalendarDays} title="Mi agenda" isDark={isDark} isLast
            onPress={() => router.push('/(app)/(tabs)/agenda' as any)} />
        </SectionCard>

        {/* ── Preferencias ─────────────────────────────────── */}
        <SectionCard title="Preferencias" isDark={isDark}>
          <SettingRow
            icon={isDark ? Moon : Sun}
            title="Apariencia"
            sub={isDark ? 'Modo oscuro' : 'Modo claro'}
            isDark={isDark}
            onPress={toggleTheme}
            right={
              <View style={{ width: 44, height: 26, borderRadius: 999, backgroundColor: isDark ? '#7059E6' : '#cbd5e1', justifyContent: 'center' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', marginLeft: isDark ? 21 : 3 }} />
              </View>
            }
          />
          <SettingRow icon={LogOut} title="Cerrar sesión" isDark={isDark} danger isLast onPress={handleLogout} />
        </SectionCard>

        {/* ── Referral ─────────────────────────────────────── */}
        {profile?.referral_code && (
          <View className="mx-4 mb-2.5 rounded-2xl border border-violet-200 dark:border-dark-border bg-violet-50/80 dark:bg-dark-surface p-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Gift size={16} stroke={isDark ? '#a78bfa' : '#7c3aed'} />
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">Invita un amigo</Text>
            </View>
            <Text className="text-xs text-gray-500 dark:text-dark-text2 mb-3 leading-5">
              Comparte tu código. Cuando tu amigo se suscriba por primera vez, ¡ambos reciben 1 mes Pro gratis!
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const link = `https://danzclass.com/auth/register?ref=${profile.referral_code}`
                await Clipboard.setStringAsync(link)
                Alert.alert('¡Copiado!', 'El enlace de invitación fue copiado al portapapeles.')
              }}
              className="flex-row items-center justify-between rounded-xl bg-white dark:bg-dark-surface2 border border-violet-200 dark:border-dark-border px-3 py-2.5"
            >
              <Text className="text-xs text-gray-500 dark:text-dark-text2 flex-1 mr-2" numberOfLines={1}>
                danzclass.com/auth/register?ref={profile.referral_code}
              </Text>
              <View className="flex-row items-center gap-1">
                <Copy size={13} stroke={isDark ? '#a78bfa' : '#7c3aed'} />
                <Text className="text-xs font-semibold text-violet-600 dark:text-violet-400">Copiar</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Estilos de baile ─────────────────────────────── */}
        {(profile.styles_teaching?.length > 0 || profile.styles_dancing?.length > 0) && (
          <SectionCard title="Estilos de baile" isDark={isDark}>
            <View className="px-4 pb-4 gap-3">
              {profile.styles_dancing?.length > 0 && (
                <View className="gap-1.5">
                  <Text className="text-[11px] font-semibold text-gray-400 dark:text-dark-text2 uppercase tracking-wide">Baila</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {profile.styles_dancing.map((s: string) => <StyleChip key={s} style={s} />)}
                  </View>
                </View>
              )}
              {profile.styles_teaching?.length > 0 && (
                <View className="gap-1.5">
                  <Text className="text-[11px] font-semibold text-gray-400 dark:text-dark-text2 uppercase tracking-wide">Enseña</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {profile.styles_teaching.map((s: string) => <StyleChip key={s} style={s} />)}
                  </View>
                </View>
              )}
            </View>
          </SectionCard>
        )}

        {/* ── Mis clases activas ───────────────────────────── */}
        {classes.length > 0 && (
          <SectionCard title={`Mis clases activas (${classes.length})`} isDark={isDark}>
            <View className="pb-2">
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
          </SectionCard>
        )}

        {/* ── Mis publicaciones (grilla Instagram) ─────────── */}
        {posts.length > 0 && (
          <SectionCard title={`Mis publicaciones (${posts.length})`} isDark={isDark}>
            <View className="pb-1">
              <ProfilePostsGrid posts={posts} currentUserId={userId ?? ''} />
            </View>
          </SectionCard>
        )}

        {/* ── Zona peligrosa + reporte ─────────────────────── */}
        <View className="items-center py-5 gap-3">
          <TouchableOpacity onPress={() => router.push('/(app)/profile/delete-account' as any)}>
            <Text className="text-xs text-red-400">Eliminar cuenta</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:contacto@danzclass.com?subject=Bug%20DanzClass')}>
            <Text className="text-xs text-violet-500">¿Encontraste algo raro? Reportar</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
