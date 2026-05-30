'use client'

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FeedFilter, Profile } from '@danceclass/shared'

type TeacherRatings = Record<string, { avg_stars: number; rating_count: number }>

export interface FeedData {
  classes: any[]
  posts: any[]
  events: any[]
  teacherRatings: TeacherRatings
}

interface FeedOptions {
  filter: FeedFilter
  followingIds: string[]
  currentProfile: Profile | null
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

export async function fetchFeedData({ filter, followingIds, currentProfile }: FeedOptions): Promise<FeedData> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  // Early return if following filter with no one followed
  if (filter === 'following' && followingIds.length === 0) {
    return { classes: [], posts: [], events: [], teacherRatings: {} }
  }

  let classQuery = supabase
    .from('classes')
    .select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id, status)')
    .eq('status', 'active')
    .or(`type.neq.suelta,date.gte.${today}`)
    .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(20)

  let postQuery = supabase
    .from('posts' as any)
    .select('id, title, description, video_url, thumbnail_url, visibility, is_public, class_id, created_at, user:profiles!user_id(*), tagged_class:classes!class_id(id, title, teacher:profiles!teacher_id(username, full_name))')
    .order('created_at', { ascending: false })
    .limit(20)

  let eventQuery = (supabase as any)
    .from('events')
    .select(`*, creator:profiles!creator_id(id, username, full_name, avatar_url), event_invites(id, status, teacher_id, teacher:profiles!teacher_id(id, username, full_name, avatar_url)), event_enrollments(id, user_id, status)`)
    .eq('status', 'active')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(20)

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
  const newClasses = (classData ?? []).filter((c: any) => {
    if (c.recurrence === 'custom') {
      return (c.custom_dates ?? []).some((d: string) => d >= todayStr)
    }
    return true
  })

  let newEvents = (eventData ?? [])
  if (filter === 'following') {
    newEvents = newEvents.filter((ev: any) =>
      followingIds.includes(ev.creator_id) ||
      (ev.event_invites ?? []).some((inv: any) => inv.status === 'accepted' && followingIds.includes(inv.teacher_id))
    )
  }

  const teacherIds = [...new Set(newClasses.map((c: any) => c.teacher_id as string))]
  const teacherRatings = await fetchTeacherRatings(supabase, teacherIds)

  return {
    classes: newClasses,
    posts: (postData as any[]) ?? [],
    events: newEvents,
    teacherRatings,
  }
}

export function useFeed({
  filter,
  followingIds,
  currentProfile,
  initialData,
}: FeedOptions & { initialData: FeedData }) {
  const queryClient = useQueryClient()

  // Seed the cache with SSR data for 'global' on first mount
  useEffect(() => {
    queryClient.setQueryData<FeedData>(['feed', 'global'], initialData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useQuery<FeedData>({
    queryKey: ['feed', filter, followingIds.join(','), currentProfile?.city ?? ''],
    queryFn: () => fetchFeedData({ filter, followingIds, currentProfile }),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}
