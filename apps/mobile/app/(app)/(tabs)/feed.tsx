import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronDown, Music2 } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import MobilePostCard from '../../../components/feed/MobilePostCard'
import TopBar from '../../../components/ui/TopBar'
import type { FeedFilter } from '@danceclass/shared'

const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'following', label: 'Siguiendo' },
  { key: 'global', label: 'Global' },
  { key: 'nearby', label: 'Cerca' },
]

type ContentFilter = 'all' | 'classes' | 'posts'
const CONTENT_FILTERS: { key: ContentFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'classes', label: 'Clases' },
  { key: 'posts', label: 'Videos' },
]

export default function FeedScreen() {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('global')
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [userCity, setUserCity] = useState<string | null>(null)
  const [friendIds, setFriendIds] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setUserId(user.id)

        const [profileRes, followsRes, friendsRes] = await Promise.all([
          supabase.from('profiles').select('city').eq('id', user.id).single(),
          supabase.from('follows').select('following_id').eq('follower_id', user.id),
          supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq('status', 'accepted'),
        ])

        setUserCity(profileRes.data?.city ?? null)
        setFollowingIds(followsRes.data?.map((f) => f.following_id) ?? [])
        const fids = (friendsRes.data ?? []).map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        )
        setFriendIds(fids)
      } catch {
        // init errors are non-blocking; feed will show empty state
      }
    }
    init()
  }, [])

  const loadFeed = useCallback(async (ff: FeedFilter, cf: ContentFilter) => {
    try {
    const uid = userId
    if (!uid) return
    const allItems: any[] = []

    // Fetch classes (if not posts-only)
    if (cf !== 'posts') {
      let q = (supabase as any)
        .from('classes')
        .select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id, status)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20)

      if (ff === 'following') {
        if (followingIds.length === 0) {
          // No follows → skip query, show nothing
        } else {
          const { data } = await q.in('teacher_id', followingIds)
          ;(data ?? []).forEach((c: any) => allItems.push({ _type: 'class', ...c }))
        }
      } else {
        if (ff === 'nearby' && userCity) q = q.eq('city', userCity)
        const { data } = await q
        ;(data ?? []).forEach((c: any) => allItems.push({ _type: 'class', ...c }))
      }
    }

    // Fetch posts (if not classes-only)
    if (cf !== 'classes') {
      let q = (supabase as any)
        .from('posts')
        .select('*, author:profiles!user_id(id, username, full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (ff === 'following') {
        if (followingIds.length === 0) {
          // No follows → skip, show nothing
        } else {
          const { data } = await q.in('user_id', followingIds)
          ;(data ?? []).forEach((p: any) => allItems.push({ _type: 'post', ...p }))
        }
      } else {
        // Global/nearby: only public posts
        q = q.eq('visibility', 'public')
        if (ff === 'nearby' && userCity) q = q.eq('city', userCity)
        const { data } = await q
        ;(data ?? []).forEach((p: any) => allItems.push({ _type: 'post', ...p }))
      }
    }

    // Sort mixed feed by created_at descending
    allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setItems(allItems)
  } catch {
    // keep whatever was already in items; user sees stale data or empty state
  } finally {
    setLoading(false)
    setRefreshing(false)
  }
  }, [followingIds, userCity, userId])

  useEffect(() => {
    if (userId !== null) loadFeed(feedFilter, contentFilter)
  }, [feedFilter, contentFilter, loadFeed, userId])

  const currentLabel = CONTENT_FILTERS.find((f) => f.key === contentFilter)?.label ?? 'Todos'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <TopBar />

      {/* Filters row */}
      <View className="flex-row items-center gap-2 px-4 py-2 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        {FEED_FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFeedFilter(key)}
            className={`rounded-full px-4 py-1.5 ${feedFilter === key ? 'bg-brand-600' : 'bg-gray-100 dark:bg-dark-surface2'}`}
          >
            <Text className={`text-sm font-medium ${feedFilter === key ? 'text-white' : 'text-gray-600 dark:text-dark-text2'}`}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Spacer */}
        <View className="flex-1" />

        {/* Content dropdown */}
        <TouchableOpacity
          onPress={() => setShowDropdown(true)}
          className="flex-row items-center gap-1 border border-gray-200 dark:border-dark-border rounded-xl px-3 py-1.5 bg-white dark:bg-dark-surface2"
        >
          <Text className="text-sm text-gray-700 dark:text-dark-text2">{currentLabel}</Text>
          <ChevronDown size={14} stroke="#374151" />
        </TouchableOpacity>
      </View>

      {/* Dropdown modal */}
      <Modal transparent visible={showDropdown} animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <Pressable className="flex-1" onPress={() => setShowDropdown(false)}>
          <View className="absolute top-28 right-4 bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-gray-100 dark:border-dark-border overflow-hidden" style={{ minWidth: 120, elevation: 8 }}>
            {CONTENT_FILTERS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => { setContentFilter(key); setShowDropdown(false) }}
                className={`px-4 py-3 ${contentFilter === key ? 'bg-brand-50 dark:bg-brand-950/30' : ''}`}
              >
                <Text className={`text-sm ${contentFilter === key ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-gray-700 dark:text-dark-text2'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: any) => `${item._type}-${item.id}`}
          renderItem={({ item }: { item: any }) =>
            item._type === 'class'
              ? <MobileClassCard classData={item} currentUserId={userId ?? ''} />
              : <MobilePostCard post={item} currentUserId={userId ?? ''} />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadFeed(feedFilter, contentFilter) }}
              tintColor="#c026d3"
            />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <View className="mb-3">
                <Icon icon={Music2} size={32} />
              </View>
              <Text className="text-gray-500 dark:text-dark-text2 text-sm">No hay contenido disponible</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
