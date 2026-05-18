'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import ClassCard from './ClassCard'
import UserCard from './UserCard'
import GenreFilter from './GenreFilter'
import type { Profile } from '@danceclass/shared'

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'
type Tab = 'classes' | 'teachers' | 'users'
type UserFilter = 'all' | 'friends' | 'following'

interface ExploreClientProps {
  teachers: Profile[]
  classes: any[]
  users: Profile[]
  currentUserId: string
  followingIds: string[]
  friendStatuses: Record<string, FriendStatus>
}

export default function ExploreClient({
  teachers,
  classes,
  users,
  currentUserId,
  followingIds,
  friendStatuses,
}: ExploreClientProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('classes')
  const [selectedStyle, setSelectedStyle] = useState('')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')

  const followingSet = new Set(followingIds)

  const filteredTeachers = teachers.filter((t) =>
    !query || t.full_name.toLowerCase().includes(query.toLowerCase()) || t.username.toLowerCase().includes(query.toLowerCase())
  )

  const filteredClasses = classes.filter((c) => {
    const matchQuery = !query || c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.dance_style?.toLowerCase().includes(query.toLowerCase())
    const matchStyle = !selectedStyle || c.dance_style === selectedStyle
    return matchQuery && matchStyle
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
    { id: 'teachers', label: 'Profesores' },
    { id: 'users', label: 'Usuarios' },
  ]

  const placeholders: Record<Tab, string> = {
    classes: 'Buscar clases...',
    teachers: 'Buscar profesores...',
    users: 'Buscar usuarios...',
  }

  return (
    <div className="flex flex-col">
      {/* Search + tabs */}
      <div className="sticky top-14 z-30 bg-blanco-violeta/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholders[activeTab]}
            className="input pl-9"
          />
        </div>

        <div className="flex gap-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
                activeTab === id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-200'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Genre filter — solo en tab clases */}
        {activeTab === 'classes' && (
          <GenreFilter selected={selectedStyle} onChange={setSelectedStyle} />
        )}
      </div>

      {/* Results */}
      {activeTab === 'classes' && (
        filteredClasses.length === 0
          ? <div className="py-12 text-center text-sm text-gray-500">Sin resultados</div>
          : filteredClasses.map((cls) => (
            <ClassCard key={cls.id} classData={cls} currentUserId={currentUserId} currentUserRole="student" />
          ))
      )}

      {activeTab === 'teachers' && (
        <div className="p-4 space-y-3">
          {filteredTeachers.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Sin resultados</div>
          ) : (
            filteredTeachers.map((teacher) => (
              <Link
                key={teacher.id}
                href={`/teacher/${teacher.username}`}
                className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
              >
                <Avatar src={teacher.avatar_url} name={teacher.full_name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">{teacher.full_name}</p>
                  <p className="text-xs text-gray-500">@{teacher.username}</p>
                  {teacher.city && <p className="text-xs text-gray-400 mt-0.5">{teacher.city}</p>}
                </div>
              </Link>
            ))
          )}
        </div>
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
                    : 'text-gray-600 border-gray-200 hover:bg-gray-100'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Sin resultados</div>
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
