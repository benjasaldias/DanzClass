import { useState, useEffect } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { SlidersHorizontal, X } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { DANCE_STYLES } from '@danceclass/shared'
import MobileClassCard from '../../../components/feed/MobileClassCard'

type UserTab = 'all' | 'friends' | 'following'
const USER_TABS: { key: UserTab; label: string }[] = [
  { key: 'all', label: 'Tod@s' },
  { key: 'friends', label: 'Amig@s' },
  { key: 'following', label: 'Siguiendo' },
]

export default function ExploreScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'classes' | 'users'>('classes')
  const [userTab, setUserTab] = useState<UserTab>('all')
  const [query, setQuery] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [classes, setClasses] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const uid = user?.id ?? ''
        setUserId(uid)

        const [classRes, userRes, friendsRes, followsRes] = await Promise.all([
          (supabase as any)
            .from('classes')
            .select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id, status)')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(30),
          supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, city, styles_teaching')
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
            .eq('status', 'accepted'),
          supabase.from('follows').select('following_id').eq('follower_id', uid),
        ])

        setClasses(classRes.data ?? [])
        setUsers(userRes.data ?? [])
        const fids = (friendsRes.data ?? []).map((f) =>
          f.requester_id === uid ? f.addressee_id : f.requester_id
        )
        setFriendIds(fids)
        setFollowingIds(followsRes.data?.map((f: any) => f.following_id) ?? [])
      } catch {
        // show empty lists on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredClasses = classes.filter((c) => {
    const matchQuery = !query ||
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.dance_style?.toLowerCase().includes(query.toLowerCase())
    const matchStyle = !selectedStyle || c.dance_style === selectedStyle
    return matchQuery && matchStyle
  })

  const baseUsers = users.filter((u) => u.id !== userId)
  const filteredUsers = baseUsers
    .filter((u) => {
      if (userTab === 'friends') return friendIds.includes(u.id)
      if (userTab === 'following') return followingIds.includes(u.id)
      return true
    })
    .filter((u) =>
      !query ||
      u.full_name?.toLowerCase().includes(query.toLowerCase()) ||
      u.username?.toLowerCase().includes(query.toLowerCase())
    )

  const activeFilterCount = selectedStyle ? 1 : 0
  const hasActiveFilters = activeFilterCount > 0

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="px-4 pt-4 pb-2 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border gap-3">
        <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">Explorar</Text>

        {/* Search bar + filter toggle */}
        <View className="flex-row gap-2 items-center">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'classes' ? 'Buscar clases...' : 'Buscar usuarios...'}
            className="flex-1 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-2.5 text-sm bg-gray-50 dark:bg-dark-surface2 text-gray-900 dark:text-dark-text"
            placeholderTextColor="#9ca3af"
          />
          {tab === 'classes' && (
            <TouchableOpacity
              onPress={() => setShowFilters((v) => !v)}
              className={`flex-row items-center gap-1 rounded-xl border px-3 py-2.5 ${
                hasActiveFilters
                  ? 'border-morado-flow bg-morado-flow/10'
                  : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2'
              }`}
            >
              <SlidersHorizontal
                size={16}
                stroke={hasActiveFilters ? '#7F77DD' : '#6B6880'}
              />
              {activeFilterCount > 0 && (
                <View className="h-4 w-4 rounded-full bg-morado-flow items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Main tab: Clases / Usuarios */}
        <View className="flex-row gap-2">
          {(['classes', 'users'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 rounded-full py-1.5 items-center ${tab === t ? 'bg-brand-600' : 'bg-gray-100 dark:bg-dark-surface2'}`}
            >
              <Text className={`text-sm font-medium ${tab === t ? 'text-white' : 'text-gray-600 dark:text-dark-text2'}`}>
                {t === 'classes' ? 'Clases' : 'Usuarios'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Collapsible genre filter (classes tab only) */}
        {tab === 'classes' && showFilters && (
          <View className="gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1">
                {DANCE_STYLES.map((style) => (
                  <TouchableOpacity
                    key={style}
                    onPress={() => setSelectedStyle(selectedStyle === style ? '' : style)}
                    className={`rounded-full px-3 py-1.5 border ${
                      selectedStyle === style
                        ? 'bg-morado-flow border-morado-flow'
                        : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${
                      selectedStyle === style ? 'text-white' : 'text-gray-600 dark:text-dark-text2'
                    }`}>
                      {style}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {hasActiveFilters && (
              <TouchableOpacity
                onPress={() => setSelectedStyle('')}
                className="flex-row items-center gap-1 self-start"
              >
                <X size={12} stroke="#7F77DD" />
                <Text className="text-xs text-morado-flow font-medium">Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* User sub-tabs */}
        {tab === 'users' && (
          <View className="flex-row gap-2">
            {USER_TABS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setUserTab(key)}
                className={`rounded-full px-3 py-1 ${userTab === key ? 'bg-morado-flow' : 'bg-gray-100 dark:bg-dark-surface2'}`}
              >
                <Text className={`text-xs font-medium ${userTab === key ? 'text-white' : 'text-gray-600 dark:text-dark-text2'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" />
        </View>
      ) : tab === 'classes' ? (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: { item: any }) => <MobileClassCard classData={item} currentUserId={userId} />}
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Text className="text-gray-500 dark:text-dark-text2 text-sm">Sin resultados</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Text className="text-gray-500 dark:text-dark-text2 text-sm">
                {userTab === 'friends' ? 'Aún no tienes amigos' :
                 userTab === 'following' ? 'No sigues a nadie aún' :
                 'Sin resultados'}
              </Text>
            </View>
          }
          renderItem={({ item: u }: { item: any }) => {
            const initials = (u.full_name ?? '')
              .split(' ')
              .map((n: string) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
            const isFriend = friendIds.includes(u.id)
            const isFollowing = followingIds.includes(u.id)
            return (
              <TouchableOpacity
                onPress={() => router.push(`/(app)/teacher/${u.username}` as any)}
                className="flex-row items-center gap-3 bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border"
              >
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} className="w-12 h-12 rounded-full" />
                ) : (
                  <View className="w-12 h-12 rounded-full bg-brand-100 items-center justify-center">
                    <Text className="text-brand-700 font-bold">{initials}</Text>
                  </View>
                )}
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-gray-900 dark:text-dark-text">{u.full_name}</Text>
                  <Text className="text-xs text-gris-humo dark:text-dark-text2">@{u.username}</Text>
                  {u.city && <Text className="text-xs text-gray-400 dark:text-dark-text2">{u.city}</Text>}
                  {u.styles_teaching?.length > 0 && (
                    <View className="flex-row flex-wrap gap-1 mt-1">
                      {u.styles_teaching.slice(0, 3).map((s: string) => (
                        <View key={s} className="bg-lavanda-suave rounded-full px-2 py-0.5">
                          <Text className="text-xs" style={{ color: '#534AB7' }}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View className="items-end gap-1">
                  {isFriend && (
                    <View className="bg-green-50 rounded-full px-2 py-0.5">
                      <Text className="text-xs text-green-700">Amig@</Text>
                    </View>
                  )}
                  {isFollowing && !isFriend && (
                    <View className="bg-brand-50 rounded-full px-2 py-0.5">
                      <Text className="text-xs text-brand-700">Siguiendo</Text>
                    </View>
                  )}
                  <Text className="text-gray-300 dark:text-dark-text2 text-lg">›</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
