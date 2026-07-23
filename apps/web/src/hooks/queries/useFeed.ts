'use client'

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { attachClassSpots } from '@/lib/feedSpots'
import type { FeedFilter, Profile } from '@danceclass/shared'

type TeacherRatings = Record<string, { avg_stars: number; rating_count: number }>

export interface FeedData {
  classes: any[]
  posts: any[]
  events: any[]
  teacherRatings: TeacherRatings
  /** True si alguna fuente devolvió el máximo pedido → puede haber más (P2-4). */
  hasMore?: boolean
}

interface FeedOptions {
  filter: FeedFilter
  followingIds: string[]
  currentProfile: Profile | null
  /** When set on the 'nearby' filter, sort by real distance via PostGIS RPC. */
  userCoords?: { lat: number; lng: number } | null
  /** Tamaño de página del feed (P2-4). "Cargar más" lo incrementa. */
  limit?: number
}

async function fetchTeacherRatings(supabase: ReturnType<typeof createClient>, teacherIds: string[]): Promise<TeacherRatings> {
  if (teacherIds.length === 0) return {}
  const { data } = await (supabase as any)
    .from('ratings')
    .select('rated_user_id, stars')
    .in('rated_user_id', teacherIds)
  const map: TeacherRatings = {}
  for (const row of (data ?? []) as { rated_user_id: string; stars: number }[]) {
    if (!map[row.rated_user_id]) map[row.rated_user_id] = { avg_stars: 0, rating_count: 0 }
    map[row.rated_user_id].rating_count++
    map[row.rated_user_id].avg_stars += Number(row.stars)
  }
  for (const id of Object.keys(map)) {
    map[id].avg_stars = Math.round((map[id].avg_stars / map[id].rating_count) * 10) / 10
  }
  return map
}

// Distance-sorted "nearby" using PostGIS RPCs. Returns classes/events with a
// `_distance_m` field, nearest first. Posts/rehearsals have no location so they
// are omitted from this view.
async function fetchNearbyData(coords: { lat: number; lng: number }): Promise<FeedData> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const RADIUS_M = 50000

  const [{ data: nearClasses }, { data: nearEvents }] = await Promise.all([
    (supabase as any).rpc('nearby_classes', { p_lat: coords.lat, p_lng: coords.lng, p_radius_m: RADIUS_M, p_limit: 60 }),
    (supabase as any).rpc('nearby_events', { p_lat: coords.lat, p_lng: coords.lng, p_radius_m: RADIUS_M, p_limit: 60 }),
  ])

  const classDist = new Map<string, number>((nearClasses ?? []).map((r: any) => [r.id, r.distance_m]))
  const eventDist = new Map<string, number>((nearEvents ?? []).map((r: any) => [r.id, r.distance_m]))
  const classIds = [...classDist.keys()]
  const eventIds = [...eventDist.keys()]

  let classes: any[] = []
  if (classIds.length) {
    const { data } = await (supabase as any)
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
      .eq('status', 'active')
      .in('id', classIds)
      .or(`type.neq.suelta,date.gte.${today}`)
      .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${today}`)
    const filtered = (data ?? [])
      .filter((c: any) => (c.recurrence === 'custom' ? (c.custom_dates ?? []).some((d: string) => d >= today) : true))
    const withSpots = await attachClassSpots(supabase as any, filtered) // P2-1
    classes = withSpots
      .map((c: any) => ({ ...c, _distance_m: classDist.get(c.id) ?? null }))
      .sort((a: any, b: any) => (a._distance_m ?? Infinity) - (b._distance_m ?? Infinity))
  }

  let events: any[] = []
  if (eventIds.length) {
    const { data } = await (supabase as any)
      .from('events')
      .select(`*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher_id, teacher:profiles!teacher_id(id, username, full_name, avatar_url)), event_enrollments(id, user_id, status)`)
      .eq('status', 'active')
      .gte('event_date', today)
      .in('id', eventIds)
    events = (data ?? [])
      .map((e: any) => ({ ...e, _distance_m: eventDist.get(e.id) ?? null }))
      .sort((a: any, b: any) => (a._distance_m ?? Infinity) - (b._distance_m ?? Infinity))
  }

  const teacherIds = [...new Set(classes.map((c: any) => c.teacher_id as string))]
  const teacherRatings = await fetchTeacherRatings(supabase, teacherIds)

  // El modo "cerca con ubicación" ya trae hasta 60 por RPC; sin paginación extra.
  return { classes, posts: [], events, teacherRatings, hasMore: false }
}

export async function fetchFeedData({ filter, followingIds, currentProfile, userCoords, limit }: FeedOptions): Promise<FeedData> {
  // Location-based nearby: defer to the PostGIS distance query.
  if (filter === 'nearby' && userCoords) {
    return fetchNearbyData(userCoords)
  }

  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const lim = limit ?? 20

  // Early return if following filter with no one followed
  if (filter === 'following' && followingIds.length === 0) {
    return { classes: [], posts: [], events: [], teacherRatings: {}, hasMore: false }
  }

  let classQuery = supabase
    .from('classes')
    .select('*, teacher:profiles!teacher_id(*), media:class_media(*)')
    .eq('status', 'active')
    .or(`type.neq.suelta,date.gte.${today}`)
    .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(lim)

  let postQuery = supabase
    .from('posts' as any)
    .select('id, title, description, video_url, thumbnail_url, visibility, is_public, class_id, created_at, user:profiles!user_id(*), tagged_class:classes!class_id(id, title, teacher:profiles!teacher_id(username, full_name))')
    .order('created_at', { ascending: false })
    .limit(lim)

  let eventQuery = (supabase as any)
    .from('events')
    .select(`*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher_id, teacher:profiles!teacher_id(id, username, full_name, avatar_url)), event_enrollments(id, user_id, status)`)
    .eq('status', 'active')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(lim)

  if (filter === 'following') {
    classQuery = classQuery.in('teacher_id', followingIds)
    postQuery = postQuery.in('user_id', followingIds)
    postQuery = (postQuery as any).in('visibility', ['public', 'followers', 'friends'])
    eventQuery = eventQuery.or(
      `creator_id.in.(${followingIds.join(',')}),event_invites.teacher_id.in.(${followingIds.join(',')})`
    )
  } else if (filter === 'nearby' && currentProfile?.city) {
    classQuery = classQuery.eq('city', currentProfile.city)
    postQuery = postQuery.eq('city', currentProfile.city)
    eventQuery = eventQuery.eq('city', currentProfile.city)
    postQuery = (postQuery as any).eq('visibility', 'public')
  } else {
    postQuery = (postQuery as any).eq('visibility', 'public')
  }

  const [{ data: classData }, { data: postData }, { data: eventData }] = await Promise.all([
    classQuery,
    postQuery,
    eventQuery,
  ])

  const todayStr = new Date().toISOString().split('T')[0]
  const filteredClasses = (classData ?? []).filter((c: any) => {
    if (c.recurrence === 'custom') {
      return (c.custom_dates ?? []).some((d: string) => d >= todayStr)
    }
    return true
  })
  const newClasses = await attachClassSpots(supabase as any, filteredClasses) // P2-1

  let newEvents = (eventData ?? [])
  if (filter === 'following') {
    newEvents = newEvents.filter((ev: any) =>
      followingIds.includes(ev.creator_id) ||
      (ev.event_invites ?? []).some((inv: any) => inv.status === 'accepted' && followingIds.includes(inv.teacher_id))
    )
  }

  const teacherIds = [...new Set(newClasses.map((c: any) => c.teacher_id as string))]
  const teacherRatings = await fetchTeacherRatings(supabase, teacherIds)

  // Puede haber más si alguna fuente devolvió la página completa (P2-4).
  const hasMore =
    (classData ?? []).length >= lim ||
    (postData ?? []).length >= lim ||
    (eventData ?? []).length >= lim

  return {
    classes: newClasses,
    posts: (postData as any[]) ?? [],
    events: newEvents,
    teacherRatings,
    hasMore,
  }
}

export function useFeed({
  filter,
  followingIds,
  currentProfile,
  userCoords,
  limit,
  initialData,
}: FeedOptions & { initialData: FeedData }) {
  const queryClient = useQueryClient()

  // Seed the cache with SSR data for 'global' on first mount
  useEffect(() => {
    queryClient.setQueryData<FeedData>(['feed', 'global'], initialData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Round coords so tiny GPS jitter doesn't bust the cache / refetch constantly.
  const coordKey = filter === 'nearby' && userCoords
    ? `${userCoords.lat.toFixed(3)},${userCoords.lng.toFixed(3)}`
    : ''

  return useQuery<FeedData>({
    queryKey: ['feed', filter, followingIds.join(','), currentProfile?.city ?? '', coordKey, limit ?? 20],
    queryFn: () => fetchFeedData({ filter, followingIds, currentProfile, userCoords, limit }),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}
