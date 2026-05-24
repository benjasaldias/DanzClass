'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X, Zap, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import ClassCard from './ClassCard'
import UserCard from './UserCard'
import GenreFilter from './GenreFilter'
import { classConflictsWithSchedule } from '@danceclass/shared'
import type { Profile } from '@danceclass/shared'

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
type Tab = 'classes' | 'users'
type UserFilter = 'all' | 'friends' | 'following'

interface UserAvailability {
  sleepStart: number
  sleepEnd: number
  busyBlocks: { weekday: number; hour: number }[]
}

interface ExploreClientProps {
  classes: any[]
  users: Profile[]
  currentUserId: string
  followingIds: string[]
  friendStatuses: Record<string, FriendStatus>
  userAvailability?: UserAvailability | null
  isLoggedIn?: boolean
}

export default function ExploreClient({ classes, users, currentUserId, followingIds, friendStatuses, userAvailability, isLoggedIn }: ExploreClientProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('classes')
  const [selectedStyle, setSelectedStyle] = useState('')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [noConflicts, setNoConflicts] = useState(false)

  const followingSet = new Set(followingIds)

  const filteredClasses = classes.filter((c) => {
    const matchQuery = !query || c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.dance_style?.toLowerCase().includes(query.toLowerCase())
    const matchStyle = !selectedStyle || c.dance_style === selectedStyle
    if (!matchQuery || !matchStyle) return false

    // "Sin topes" filter
    if (noConflicts && userAvailability) {
      const conflicts = classConflictsWithSchedule(
        c,
        userAvailability.busyBlocks,
        userAvailability.sleepStart,
        userAvailability.sleepEnd,
      )
      if (conflicts) return false
    }

    return true
  })

  const filteredUsers = users.filter((u) => {
    const matchQuery = !query ||
      u.full_name.toLowerCase().includes(query.toLowerCase()) ||
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      u.city?.toLowerCase().includes(query.toLowerCase())
    const matchFilter =
      userFilter === 'all' ||
      (userFilter === 'friends' && friendStatuses[u.id] === 'accepted') ||
      (userFilter === 'following' && followingSet.has(u.id))
    return matchQuery && matchFilter
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'classes', label: 'Clases' },
    { id: 'users', label: 'Usuarios' },
  ]

  const placeholders: Record<Tab, string> = {
    classes: 'Buscar clases...',
    users: 'Buscar usuarios...',
  }

  const activeFilterCount = (selectedStyle ? 1 : 0) + (noConflicts ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  return (
    <div className="flex flex-col">
      {/* Search + tabs + filters */}
      <div className="sticky top-14 z-30 bg-blanco-violeta/80 dark:bg-dark-bg/80 backdrop-blur-md border-b border-gray-100 dark:border-dark-border px-4 py-3 space-y-2">
        {/* Search bar + filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholders[activeTab]}
              className="input pl-9"
            />
          </div>
          {activeTab === 'classes' && (
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                hasActiveFilters
                  ? 'border-morado-flow bg-morado-flow/10 text-morado-flow'
                  : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-morado-flow text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
                activeTab === id
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-600 dark:text-dark-text2 hover:bg-gray-200 dark:hover:bg-dark-surface2'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Collapsible genre filter */}
        {activeTab === 'classes' && showFilters && (
          <div className="space-y-3">
            <GenreFilter selected={selectedStyle} onChange={setSelectedStyle} />

            {/* Sin topes filter */}
            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <button
                  onClick={() => setNoConflicts((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    noConflicts
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2'
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Sin topes
                  {noConflicts && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">✓</span>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full border border-gray-100 dark:border-dark-border px-3 py-1.5 text-xs text-gray-400 dark:text-dark-text2 opacity-60 cursor-not-allowed">
                  <Zap className="h-3.5 w-3.5" />
                  Sin topes
                  <Lock className="h-3 w-3" />
                </div>
              )}
              <span className="text-xs text-gris-humo dark:text-dark-text2">
                {noConflicts ? 'Mostrando clases sin choque con tu agenda' : 'Filtra según tu disponibilidad'}
              </span>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => { setSelectedStyle(''); setNoConflicts(false) }}
                className="flex items-center gap-1 text-xs text-morado-flow hover:text-morado-flow/80 font-medium"
              >
                <X className="h-3 w-3" />
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {activeTab === 'classes' && (
        filteredClasses.length === 0
          ? <div className="py-12 text-center text-sm text-gray-500 dark:text-dark-text2">Sin resultados</div>
          : filteredClasses.map((cls) => (
            <ClassCard key={cls.id} classData={cls} currentUserId={currentUserId} currentUserRole="student" />
          ))
      )}

      {activeTab === 'users' && (
        <div className="p-4 space-y-3">
          {/* Relationship filter */}
          <div className="flex gap-2">
            {([
              { id: 'all', label: 'Tod@s' },
              { id: 'friends', label: 'Amig@s' },
              { id: 'following', label: 'Siguiendo' },
            ] as { id: UserFilter; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setUserFilter(id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                  userFilter === id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'text-gray-600 dark:text-dark-text2 border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-surface2'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-dark-text2">Sin resultados</div>
          ) : (
            filteredUsers.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                currentUserId={currentUserId}
                initialFollowing={followingSet.has(u.id)}
                initialFriendStatus={friendStatuses[u.id] ?? 'none'}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
