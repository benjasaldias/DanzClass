'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Check, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'

interface InviteTeachersModalProps {
  eventId: string
  existingInvites: any[]
  onClose: () => void
}

export default function InviteTeachersModal({ eventId, existingInvites, onClose }: InviteTeachersModalProps) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [inviting, setInviting] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(
    new Set(existingInvites.map((i) => i.teacher_id))
  )
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .ilike('username', `%${query}%`)
        .limit(8)
      setResults(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function invite(teacherId: string) {
    setInviting(teacherId)
    setError(null)
    try {
      const { error: err } = await (supabase as any)
        .from('event_invites')
        .insert({ event_id: eventId, teacher_id: teacherId })
      if (err) throw err

      // Send notification
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications: [{
            user_id: teacherId,
            type: 'event_invite',
            data: { event_id: eventId },
          }],
        }),
      }).catch(() => {})

      setInvitedIds(prev => new Set([...prev, teacherId]))
    } catch (e: any) {
      setError(e.message ?? 'Error al enviar invitación')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-dark-surface rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border">
          <h2 className="font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            Invitar profesor
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2">
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text2" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre de usuario..."
              className="input w-full pl-9"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {results.map((user: any) => {
              const isInvited = invitedIds.has(user.id)
              return (
                <div key={user.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-surface2">
                  <Avatar url={user.avatar_url} name={user.full_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{user.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text2">@{user.username}</p>
                  </div>
                  {isInvited ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3.5 w-3.5" /> Invitado
                    </span>
                  ) : (
                    <button
                      onClick={() => invite(user.id)}
                      disabled={inviting === user.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {inviting === user.id ? '...' : 'Invitar'}
                    </button>
                  )}
                </div>
              )
            })}
            {query.length >= 2 && results.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-dark-text2 text-center py-4">
                No se encontraron usuarios con ese nombre
              </p>
            )}
            {query.length < 2 && (
              <p className="text-xs text-gray-400 dark:text-dark-text2 text-center py-2">
                Escribe al menos 2 caracteres para buscar
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
