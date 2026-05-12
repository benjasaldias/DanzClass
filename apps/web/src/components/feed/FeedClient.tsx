'use client'

import { useState, useCallback } from 'react'
import { Users, Globe, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import ClassCard from './ClassCard'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@danceclass/shared'
import type { FeedFilter } from '@danceclass/shared'

interface FeedClientProps {
  initialClasses: any[]
  currentUser: User
  currentProfile: Profile | null
  followingIds: string[]
}

const FILTERS: { key: FeedFilter; label: string; icon: React.ElementType }[] = [
  { key: 'following', label: 'Siguiendo', icon: Users },
  { key: 'global', label: 'Global', icon: Globe },
  { key: 'nearby', label: 'Cerca', icon: MapPin },
]

export default function FeedClient({
  initialClasses,
  currentUser,
  currentProfile,
  followingIds,
}: FeedClientProps) {
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('global')
  const [classes, setClasses] = useState(initialClasses)
  const [loading, setLoading] = useState(false)

  const loadFeed = useCallback(async (filter: FeedFilter) => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('classes')
      .select(`*, teacher:profiles!teacher_id(*), media:class_media(*)`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20)

    if (filter === 'following') {
      if (followingIds.length === 0) {
        setClasses([])
        setLoading(false)
        return
      }
      query = query.in('teacher_id', followingIds)
    } else if (filter === 'nearby' && currentProfile?.city) {
      query = query.eq('city', currentProfile.city)
    }

    const { data } = await query
    setClasses(data ?? [])
    setLoading(false)
  }, [followingIds, currentProfile])

  function handleFilterChange(filter: FeedFilter) {
    setActiveFilter(filter)
    loadFeed(filter)
  }

  return (
    <div className="flex flex-col">
      {/* Filter tabs */}
      <div className="sticky top-14 z-30 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 px-4">
        <div className="flex gap-1 py-2">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                activeFilter === key
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex flex-col">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : classes.length === 0 ? (
          <EmptyState filter={activeFilter} />
        ) : (
          classes.map((cls) => (
            <ClassCard
              key={cls.id}
              classData={cls}
              currentUserId={currentUser.id}
              currentUserRole={currentProfile?.role ?? 'student'}
            />
          ))
        )}
      </div>
    </div>
  )
}

function EmptyState({ filter }: { filter: FeedFilter }) {
  const messages: Record<FeedFilter, { title: string; desc: string }> = {
    following: {
      title: 'Aún no sigues a nadie',
      desc: 'Explora profesores y síguelos para ver sus clases aquí',
    },
    global: {
      title: 'No hay clases publicadas',
      desc: 'Sé el primero en publicar una clase',
    },
    nearby: {
      title: 'Sin clases cerca',
      desc: 'No hay clases disponibles en tu ciudad',
    },
  }

  const { title, desc } = messages[filter]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Globe className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
    </div>
  )
}
