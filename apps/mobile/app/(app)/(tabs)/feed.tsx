import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronDown, Music2 } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import MobilePostCard from '../../../components/feed/MobilePostCard'
import MobileRehearsalCard from '../../../components/feed/MobileRehearsalCard'
import MobileEventCard from '../../../components/feed/MobileEventCard'
import TopBar from '../../../components/ui/TopBar'
import RatingPopup from '../../../components/ui/RatingPopup'
import FloatingActionButton from '../../../components/ui/FloatingActionButton'
import OnboardingTour from '../../../components/feed/OnboardingTour'
import { useTheme } from '../../../context/ThemeContext'
import { getUserLocation, type LocationResult } from '../../../lib/location'
import { canTeach } from '@danceclass/shared'
import type { FeedFilter, SubscriptionTier } from '@danceclass/shared'

type TeacherRatings = Record<string, { avg_stars: number; rating_count: number }>

// P2-1: adjunta spots_taken/spots_available desde la vista class_spots en vez de
// embeber todas las enrollments por clase. class_spots ya excluye holds vencidos.
async function attachClassSpots(items: any[]): Promise<any[]> {
  if (!items.length) return items
  const ids = items.map((c) => c.id)
  const { data } = await (supabase as any)
    .from('class_spots')
    .select('class_id, spots_taken, spots_available')
    .in('class_id', ids)
  const map = new Map<string, any>((data ?? []).map((r: any) => [r.class_id, r]))
  return items.map((c) => {
    const s = map.get(c.id)
    return s ? { ...c, spots_taken: s.spots_taken, spots_available: s.spots_available } : c
  })
}

const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'following', label: 'Siguiendo' },
  { key: 'global', label: 'Global' },
  { key: 'nearby', label: 'Cerca' },
]

type ContentFilter = 'all' | 'classes' | 'posts' | 'rehearsals' | 'events'
const CONTENT_FILTERS: { key: ContentFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'classes', label: 'Clases' },
  { key: 'posts', label: 'Videos' },
  { key: 'rehearsals', label: 'Ensayos' },
  { key: 'events', label: 'Eventos' },
]

export default function FeedScreen() {
  const { isDark } = useTheme()
  const router = useRouter()
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('global')
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pageSize, setPageSize] = useState(20)      // P2-4: "Cargar más" lo sube
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [userCity, setUserCity] = useState<string | null>(null)
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [teacherRatings, setTeacherRatings] = useState<TeacherRatings>({})
  const [tier, setTier] = useState<SubscriptionTier>('none')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locStatus, setLocStatus] = useState<LocationResult['status'] | 'loading' | 'idle'>('idle')

  // Request device location when the "Cerca" tab becomes active.
  useEffect(() => {
    if (feedFilter !== 'nearby' || userLocation) return
    let cancelled = false
    setLocStatus('loading')
    getUserLocation().then((res) => {
      if (cancelled) return
      setLocStatus(res.status)
      if (res.status === 'granted') setUserLocation(res.location)
    })
    return () => { cancelled = true }
  }, [feedFilter, userLocation])

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setUserId(user.id)

        const [profileRes, followsRes, friendsRes, subRes] = await Promise.all([
          supabase.from('profiles').select('city').eq('id', user.id).single(),
          supabase.from('follows').select('following_id').eq('follower_id', user.id),
          supabase.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq('status', 'accepted'),
          supabase.from('subscriptions').select('tier').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
        ])

        setUserCity(profileRes.data?.city ?? null)
        setFollowingIds(followsRes.data?.map((f) => f.following_id) ?? [])
        const fids = (friendsRes.data ?? []).map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        )
        setFriendIds(fids)
        setTier((subRes.data?.tier as SubscriptionTier) ?? 'none')
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
    // Location-based nearby: distance-sort via PostGIS RPC (classes/events only).
    const nearbyCoords = ff === 'nearby' ? userLocation : null

    // Fetch classes (if not posts-only)
    if (cf !== 'posts') {
      const todayStr = new Date().toISOString().split('T')[0]
      let q = (supabase as any)
        .from('classes')
        .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
        .eq('status', 'active')
        // Exclude expired sueltas
        .or(`type.neq.suelta,date.gte.${todayStr}`)
        // Exclude expired periodica/entrenamiento
        .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${todayStr}`)
        .order('created_at', { ascending: false })
        .limit(pageSize)

      const filterCustom = (items: any[]) =>
        items.filter((c: any) => {
          if (c.recurrence === 'custom') return (c.custom_dates ?? []).some((d: string) => d >= todayStr)
          return true
        })

      if (ff === 'following') {
        if (followingIds.length === 0) {
          // No follows → skip query, show nothing
        } else {
          const { data } = await q.in('teacher_id', followingIds)
          const withSpots = await attachClassSpots(filterCustom(data ?? []))
          withSpots.forEach((c: any) => allItems.push({ _type: 'class', ...c }))
        }
      } else if (nearbyCoords) {
        // Distance-ranked via PostGIS, then hydrate the rows.
        const { data: near } = await (supabase as any).rpc('nearby_classes', {
          p_lat: nearbyCoords.lat, p_lng: nearbyCoords.lng, p_radius_m: 50000, p_limit: 60,
        })
        const distById = new Map<string, number>((near ?? []).map((r: any) => [r.id, r.distance_m]))
        const ids = [...distById.keys()]
        if (ids.length > 0) {
          const { data } = await (supabase as any)
            .from('classes')
            .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
            .eq('status', 'active')
            .in('id', ids)
            .or(`type.neq.suelta,date.gte.${todayStr}`)
            .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${todayStr}`)
          const withSpots = await attachClassSpots(filterCustom(data ?? []))
          withSpots.forEach((c: any) =>
            allItems.push({ _type: 'class', _distance_m: distById.get(c.id) ?? null, ...c })
          )
        }
      } else {
        if (ff === 'nearby' && userCity) q = q.eq('city', userCity)
        const { data } = await q
        const withSpots = await attachClassSpots(filterCustom(data ?? []))
        withSpots.forEach((c: any) => allItems.push({ _type: 'class', ...c }))
      }
    }

    // Fetch posts (if not classes-only). Skipped in location-based nearby (no geo on posts).
    if (cf !== 'classes' && !nearbyCoords) {
      let q = (supabase as any)
        .from('posts')
        .select('*, author:profiles!user_id(id, username, full_name, avatar_url), tagged_class:classes!class_id(id, title, teacher:profiles!teacher_id(username, full_name))')
        .order('created_at', { ascending: false })
        .limit(pageSize)

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

    // Fetch rehearsals (if not classes-only or posts-only). Skipped in location-based nearby.
    if ((cf === 'all' || cf === 'rehearsals') && !nearbyCoords) {
      const { data: rehearsalData } = await (supabase as any)
        .from('rehearsals')
        .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url), invites:rehearsal_invites(id, user_id, status, user:profiles!user_id(id, username, full_name, avatar_url))')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20)
      ;(rehearsalData ?? []).forEach((r: any) => {
        const myInvite = (r.invites ?? []).find((i: any) => i.user_id === uid) ?? null
        allItems.push({ _type: 'rehearsal', ...r, my_invite: myInvite })
      })
    }

    // Fetch events
    if (cf === 'all' || cf === 'events') {
      const todayStr = new Date().toISOString().split('T')[0]
      let evQ = (supabase as any)
        .from('events')
        .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher_id, teacher:profiles!teacher_id(id, username, full_name)), event_enrollments(id, user_id, status)')
        .eq('status', 'active')
        .gte('event_date', todayStr)
        .order('event_date', { ascending: true })
        .limit(pageSize)

      if (ff === 'following') {
        if (followingIds.length > 0) {
          const { data: evData } = await evQ
          const filtered = (evData ?? []).filter((ev: any) =>
            followingIds.includes(ev.creator_id) ||
            (ev.event_invites ?? []).some((inv: any) => inv.status === 'accepted' && followingIds.includes(inv.teacher_id))
          )
          filtered.forEach((ev: any) => allItems.push({ _type: 'event', ...ev }))
        }
      } else if (nearbyCoords) {
        const { data: nearEv } = await (supabase as any).rpc('nearby_events', {
          p_lat: nearbyCoords.lat, p_lng: nearbyCoords.lng, p_radius_m: 50000, p_limit: 60,
        })
        const distById = new Map<string, number>((nearEv ?? []).map((r: any) => [r.id, r.distance_m]))
        const ids = [...distById.keys()]
        if (ids.length > 0) {
          const { data: evData } = await (supabase as any)
            .from('events')
            .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher_id, teacher:profiles!teacher_id(id, username, full_name)), event_enrollments(id, user_id, status)')
            .eq('status', 'active')
            .gte('event_date', todayStr)
            .in('id', ids)
          ;(evData ?? []).forEach((ev: any) =>
            allItems.push({ _type: 'event', _distance_m: distById.get(ev.id) ?? null, ...ev })
          )
        }
      } else {
        if (ff === 'nearby' && userCity) evQ = evQ.eq('city', userCity)
        const { data: evData } = await evQ
        ;(evData ?? []).forEach((ev: any) => allItems.push({ _type: 'event', ...ev }))
      }
    }

    // Sort by distance for location-based nearby, otherwise newest first.
    if (nearbyCoords) {
      allItems.sort((a, b) => (a._distance_m ?? Infinity) - (b._distance_m ?? Infinity))
    } else {
      allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    // P2-4: puede haber más si clases o posts llenaron la página.
    const classCount = allItems.filter((i) => i._type === 'class').length
    const postCount = allItems.filter((i) => i._type === 'post').length
    setHasMore(classCount >= pageSize || postCount >= pageSize)
    setItems(allItems)

    // Batch-fetch ratings for visible teachers
    const teacherIds = [...new Set(allItems.filter((i) => i._type === 'class').map((i: any) => i.teacher_id as string))]
    if (teacherIds.length > 0) {
      const { data: ratingsRows } = await (supabase as any)
        .from('ratings')
        .select('rated_user_id, stars')
        .in('rated_user_id', teacherIds)
      const map: TeacherRatings = {}
      for (const row of (ratingsRows ?? []) as { rated_user_id: string; stars: number }[]) {
        if (!map[row.rated_user_id]) map[row.rated_user_id] = { avg_stars: 0, rating_count: 0 }
        map[row.rated_user_id].rating_count++
        map[row.rated_user_id].avg_stars += Number(row.stars)
      }
      for (const id of Object.keys(map)) {
        map[id].avg_stars = Math.round((map[id].avg_stars / map[id].rating_count) * 10) / 10
      }
      setTeacherRatings((prev) => ({ ...prev, ...map }))
    }
  } catch {
    // keep whatever was already in items; user sees stale data or empty state
  } finally {
    setLoading(false)
    setRefreshing(false)
    setLoadingMore(false)
  }
  }, [followingIds, userCity, userId, userLocation, pageSize])

  useEffect(() => {
    if (userId !== null) loadFeed(feedFilter, contentFilter)
  }, [feedFilter, contentFilter, loadFeed, userId])

  // P2-4: reiniciar la paginación al cambiar de pestaña o tipo de contenido.
  useEffect(() => { setPageSize(20) }, [feedFilter, contentFilter])

  const currentLabel = CONTENT_FILTERS.find((f) => f.key === contentFilter)?.label ?? 'Todos'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <OnboardingTour />
      {userId && <RatingPopup userId={userId} />}
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
          <ChevronDown size={14} stroke={isDark ? '#EEEDFE' : '#374151'} />
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
              ? <MobileClassCard classData={item} currentUserId={userId ?? ''} teacherRating={teacherRatings[item.teacher_id]} distanceM={feedFilter === 'nearby' ? item._distance_m ?? null : null} />
              : item._type === 'rehearsal'
                ? <MobileRehearsalCard rehearsal={item} currentUserId={userId ?? ''} onUpdate={() => loadFeed(feedFilter, contentFilter)} />
                : item._type === 'event'
                  ? <MobileEventCard event={item} />
                  : <MobilePostCard post={item} currentUserId={userId ?? ''} />
          }
          ListHeaderComponent={
            feedFilter === 'nearby' ? (
              <View className="px-4 pt-3">
                {locStatus === 'loading' && (
                  <View className="flex-row items-center gap-2 rounded-xl border border-[#7F77DD]/30 bg-[#EEEDFE]/50 dark:bg-dark-surface2/60 p-3">
                    <ActivityIndicator size="small" color="#7F77DD" />
                    <Text className="text-sm text-gray-700 dark:text-dark-text">Obteniendo tu ubicación…</Text>
                  </View>
                )}
                {locStatus === 'granted' && userLocation && (
                  <View className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
                    <Text className="text-sm text-emerald-700 dark:text-emerald-400">📍 Clases ordenadas por cercanía a ti.</Text>
                  </View>
                )}
                {(locStatus === 'denied' || locStatus === 'unavailable') && (
                  <View className="rounded-xl border border-coral-fuego/30 bg-coral-fuego/10 p-3">
                    <Text className="text-sm text-gray-700 dark:text-dark-text">
                      {locStatus === 'denied'
                        ? 'Activa el permiso de ubicación para ver clases por cercanía.'
                        : 'No pudimos obtener tu ubicación.'}
                      {userCity ? ' Mostrando por tu ciudad.' : ''}
                    </Text>
                  </View>
                )}
              </View>
            ) : null
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
          ListFooterComponent={
            hasMore && items.length > 0 ? (
              <View className="items-center py-5">
                <TouchableOpacity
                  onPress={() => { setLoadingMore(true); setPageSize((p) => p + 20) }}
                  disabled={loadingMore}
                  className="rounded-full border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-6 py-2.5"
                  style={{ opacity: loadingMore ? 0.6 : 1 }}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color="#7F77DD" />
                  ) : (
                    <Text className="text-sm font-medium text-gray-700 dark:text-dark-text">Cargar más</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {canTeach(tier) && (
        <FloatingActionButton onPress={() => router.push('/(app)/(tabs)/create' as any)} />
      )}
    </SafeAreaView>
  )
}
