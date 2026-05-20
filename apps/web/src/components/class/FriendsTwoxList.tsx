'use client'

import { useState } from 'react'
import { Users, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { cn, formatCLP } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import Link from 'next/link'

interface TwoxEntry {
  id: string
  user_id: string
  class_id: string
  user: { username: string; full_name: string; avatar_url: string | null }
  class: { title: string; price_2x: number | null; price_suelta_2x: number | null; type: string }
}

interface FriendsTwoxListProps {
  requests: TwoxEntry[]
  currentUserId: string
}

export default function FriendsTwoxList({ requests, currentUserId }: FriendsTwoxListProps) {
  const [open, setOpen] = useState(false)
  const [matching, setMatching] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [errorId, setErrorId] = useState<string | null>(null)

  if (requests.length === 0) return null

  async function handleMatch(requestId: string) {
    setMatching(requestId)
    setErrorId(null)
    const res = await fetch('/api/class-2x/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId }),
    })
    if (res.ok) {
      setGone((prev) => new Set([...prev, requestId]))
    } else if (res.status === 404) {
      // Already taken — remove from list with feedback
      setErrorId(requestId)
      setTimeout(() => {
        setGone((prev) => new Set([...prev, requestId]))
        setErrorId(null)
      }, 2000)
    }
    setMatching(null)
  }

  const active = requests.filter((r) => !gone.has(r.id))

  return (
    <div className="border-b border-gray-100 dark:border-dark-border bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-950/20 dark:to-violet-950/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600">
            <Users className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">
            {active.length === 1
              ? '1 amig@ busca compañer@ 2x'
              : `${active.length} amig@s buscan compañer@ 2x`}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500 dark:text-dark-text2" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500 dark:text-dark-text2" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {active.map((entry) => {
            const price = entry.class.price_2x ?? entry.class.price_suelta_2x
            const alreadyTaken = errorId === entry.id
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border px-3 py-2.5"
              >
                <Link href={`/teacher/${entry.user.username}`} className="flex-shrink-0">
                  <Avatar src={entry.user.avatar_url} name={entry.user.full_name} size="sm" />
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{entry.user.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2 truncate">{entry.class.title}</p>
                  {price && !alreadyTaken && (
                    <p className="text-xs text-brand-600 font-medium">{formatCLP(price)} en pareja</p>
                  )}
                  {alreadyTaken && (
                    <p className="text-xs text-red-500 font-medium">Ya fue tomado por otra persona</p>
                  )}
                </div>
                <button
                  onClick={() => handleMatch(entry.id)}
                  disabled={matching === entry.id || alreadyTaken}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    alreadyTaken
                      ? 'bg-red-100 text-red-500 cursor-not-allowed'
                      : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'
                  )}
                >
                  {matching === entry.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : alreadyTaken ? 'Tomado' : '¡Ir juntos!'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
