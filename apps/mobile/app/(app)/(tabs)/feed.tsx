import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import type { FeedFilter } from '@danceclass/shared'

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'following', label: 'Siguiendo' },
  { key: 'global', label: 'Global' },
  { key: 'nearby', label: 'Cerca' },
]

export default function FeedScreen() {
  const [filter, setFilter] = useState<FeedFilter>('global')
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [userCity, setUserCity] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('city').eq('id', user.id).single()
      setUserCity(profile?.city ?? null)

      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
      setFollowingIds(follows?.map((f) => f.following_id) ?? [])
    }
    init()
  }, [])

  const loadFeed = useCallback(async (activeFilter: FeedFilter) => {
    let query = supabase
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20)

    if (activeFilter === 'following') {
      if (followingIds.length === 0) { setClasses([]); setLoading(false); return }
      query = query.in('teacher_id', followingIds)
    } else if (activeFilter === 'nearby' && userCity) {
      query = query.eq('city', userCity)
    }

    const { data } = await query
    setClasses(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [followingIds, userCity])

  useEffect(() => { loadFeed(filter) }, [filter, loadFeed])

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">💃 DanceClass</Text>
      </View>

      {/* Filter tabs */}
      <View className="flex-row gap-2 px-4 py-2 border-b border-gray-100">
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 ${filter === key ? 'bg-brand-600' : 'bg-gray-100'}`}
          >
            <Text className={`text-sm font-medium ${filter === key ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" size="large" />
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MobileClassCard classData={item} currentUserId={userId ?? ''} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadFeed(filter) }}
              tintColor="#c026d3"
            />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-500 text-sm">No hay clases disponibles</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
