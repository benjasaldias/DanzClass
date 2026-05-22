'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Users, Globe, MapPin, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import ClassCard from './ClassCard'
import PostCard from './PostCard'
import FriendsTwoxList from '@/components/class/FriendsTwoxList'
import type { User } from '@supabase/supabase-js'
import type { Profile, FeedFilter } from '@danceclass/shared'

type ContentType = 'all' | 'classes' | 'posts'
type TeacherRatings = Record<string, { avg_stars: number; rating_count: number }>

interface FeedClientProps {
  initialClasses: any[]
  initialPosts: any[]
  currentUser: User
  currentProfile: Profile | null
  followingIds: string[]
  friendsTwoxRequests?: any[]
  initialTeacherRatings?: TeacherRatings
}

const FILTERS: { key: FeedFilter; label: string; icon: React.ElementType }[] = [
  { key: 'following', label: 'Siguiendo', icon: Users },
  { key: 'global', label: 'Global', icon: Globe },
  { key: 'nearby', label: 'Cerca', icon: MapPin },
]

const CONTENT_LABELS: Record<ContentType, string> = {
  all: 'Todos',
  classes: 'Clases',
  posts: 'Videos',
}

async function fetchTeacherRatings(supabase: ReturnType<typeof createClient>, teacherIds: string[]): Promise<TeacherRatings> {
  if (teacherIds.length === 0) return {}
  const { data } = await (supabase as any).from('ratings').select('rated_user_id, stars').in('rated_user_id', teacherIds)
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

export default function FeedClient({
  initialClasses,
  initialPosts,
  currentUser,
  currentProfile,
  followingIds,
  friendsTwoxRequests = [],
  initialTeacherRatings = {},
}: FeedClientProps) {
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('global')
  const [contentType, setContentType] = useState<ContentType>('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [classes, setClasses] = useState(initialClasses)
  const [posts, setPosts] = useState(initialPosts)
  const [loading, setLoading] = useState(false)
  const [teacherRatings, setTeacherRatings] = useState<TeacherRatings>(initialTeacherRatings)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const loadFeed = useCallback(async (filter: FeedFilter) => {
    setLoading(true)
    const supabase = createClient()

    let classQuery = supabase
      .from('classes')
      .select('*, teacher:profiles!teacher_id(*), media:class_media(*), enrollments(id, status)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20)

    let postQuery = supabase
      .from('posts' as any)
      .select('*, user:profiles!user_id(*)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (filter === 'following') {
      if (followingIds.length === 0) { setClasses([]); setPosts([]); setLoading(false); return }
      classQuery = classQuery.in('teacher_id', followingIds)
      postQuery = postQuery.in('user_id', followingIds)
    } else if (filter === 'nearby' && currentProfile?.city) {
      classQuery = classQuery.eq('city', currentProfile.city)
      postQuery = postQuery.eq('city', currentProfile.city)
    }

    if (filter !== 'following') {
      postQuery = (postQuery as any).eq('visibility', 'public')
    } else {
      postQuery = (postQuery as any).in('visibility', ['public', 'followers', 'friends'])
    }

    const [{ data: classData }, { data: postData }] = await Promise.all([classQuery, postQuery])
    const newClasses = classData ?? []
    setClasses(newClasses)
    setPosts((postData as any[]) ?? [])

    // Fetch ratings for the new set of teachers
    const teacherIds = [...new Set(newClasses.map((c: any) => c.teacher_id as string))]
    const ratings = await fetchTeacherRatings(supabase, teacherIds)
    setTeacherRatings((prev) => ({ ...prev, ...ratings }))

    setLoading(false)
  }, [followingIds, currentProfile])

  function handleFilterChange(filter: FeedFilter) {
    setActiveFilter(filter)
    loadFeed(filter)
  }

  const feedItems: { type: 'class' | 'post'; data: any; created_at: string }[] = []
  if (contentType !== 'posts') {
    classes.forEach((c) => feedItems.push({ type: 'class', data: c, created_at: c.created_at }))
  }
  if (contentType !== 'classes') {
    posts.forEach((p) => feedItems.push({ type: 'post', data: p, created_at: p.created_at }))
  }
  feedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="sticky top-14 z-30 bg-blanco-violeta/80 dark:bg-dark-bg/90 backdrop-blur-md border-b border-gray-100 dark:border-dark-border px-4">
        <div className="flex items-center gap-2 py-2">
          <div className="flex gap-1 flex-1 overflow-x-auto no-scrollbar">
            {FILTERS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                  activeFilter === key ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-dark-text2 hover:bg-gray-200 dark:hover:bg-dark-surface'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div ref={dropdownRef} className="relative flex-shrink-0">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors"
            >
              {CONTENT_LABELS[contentType]}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-32 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 shadow-lg overflow-hidden z-40">
                {(Object.keys(CONTENT_LABELS) as ContentType[]).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => { setContentType(ct); setDropdownOpen(false) }}
                    className={cn(
                      'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors dark:text-dark-text2',
                      contentType === ct && 'font-semibold text-brand-600 dark:text-brand-300'
                    )}
                  >
                    {CONTENT_LABELS[ct]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Friends 2x section */}
      {activeFilter === 'following' && friendsTwoxRequests.length > 0 && (
        <FriendsTwoxList
          requests={friendsTwoxRequests}
          currentUserId={currentUser.id}
        />
      )}

      {/* Feed */}
      <div className="flex flex-col">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : feedItems.length === 0 ? (
          <EmptyState filter={activeFilter} contentType={contentType} />
        ) : (
          feedItems.map((item) =>
            item.type === 'class'
              ? <ClassCard
                  key={`class-${item.data.id}`}
                  classData={item.data}
                  currentUserId={currentUser.id}
                  currentUserRole={currentProfile?.role ?? 'user'}
                  teacherRating={teacherRatings[item.data.teacher_id]}
                />
              : <PostCard key={`post-${item.data.id}`} post={item.data} currentUserId={currentUser.id} />
          )
        )}
      </div>
    </div>
  )
}

function EmptyState({ filter, contentType }: { filter: FeedFilter; contentType: ContentType }) {
  const typeLabel = contentType === 'posts' ? 'videos' : contentType === 'classes' ? 'clases' : 'contenido'
  const messages: Record<FeedFilter, { title: string; desc: string }> = {
    following: { title: 'Aún no sigues a nadie', desc: `Explora profesores para ver sus ${typeLabel} aquí` },
    global: { title: `Aún no hay ${typeLabel}`, desc: `Sé el primero en publicar` },
    nearby: { title: `Sin ${typeLabel} cerca`, desc: 'No hay contenido disponible en tu ciudad' },
  }
  const { title, desc } = messages[filter]
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface2">
        <Globe className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-dark-text">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-dark-text2">{desc}</p>
    </div>
  )
}
