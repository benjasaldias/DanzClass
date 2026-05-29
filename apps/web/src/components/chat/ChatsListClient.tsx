'use client'

import Link from 'next/link'
import { MessageCircle, Users, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function ChatsListClient({ chats, currentUserId }: { chats: any[]; currentUserId: string }) {
  return (
    <div className="px-4 py-4 pb-24 max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <MessageCircle className="h-5 w-5 text-violet-500" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Mensajes</h1>
      </div>

      {chats.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface mb-4">
            <MessageCircle className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-dark-text">Sin mensajes aún</h3>
          <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">
            Cuando te inscribas en una clase o seas invitado a un ensayo, podrás chatear aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((chat: any) => {
            const isGroup = chat.type === 'rehearsal'
            const otherParticipant = isGroup ? null
              : (chat.participants ?? []).find((p: any) => p.user_id !== currentUserId)?.user

            const title = chat.type === 'class'
              ? chat.class?.title ?? 'Chat de clase'
              : chat.rehearsal?.title ?? 'Chat de ensayo'

            const lastMsg = chat.last_message
            const timeLabel = lastMsg ? timeAgo(lastMsg.created_at) : ''
            const hasUnread = lastMsg && chat.last_read_at
              ? new Date(lastMsg.created_at) > new Date(chat.last_read_at)
              : !!lastMsg

            return (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4 hover:shadow-md transition-shadow"
              >
                {isGroup ? (
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30">
                    <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                ) : otherParticipant ? (
                  <Avatar src={otherParticipant.avatar_url} name={otherParticipant.full_name} size="md" />
                ) : (
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface2">
                    <BookOpen className="h-5 w-5 text-gray-400" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={cn(
                      'text-sm truncate',
                      hasUnread ? 'font-bold text-gray-900 dark:text-dark-text' : 'font-medium text-gray-900 dark:text-dark-text'
                    )}>
                      {isGroup ? title : (otherParticipant?.full_name ?? title)}
                    </p>
                    {timeLabel && (
                      <span className="text-[10px] text-gray-400 dark:text-dark-text2 flex-shrink-0">{timeLabel}</span>
                    )}
                  </div>
                  {!isGroup && (
                    <p className="text-xs text-gray-400 dark:text-dark-text2 truncate">{title}</p>
                  )}
                  {lastMsg && (
                    <p className={cn(
                      'text-xs truncate mt-0.5',
                      hasUnread ? 'text-gray-700 dark:text-dark-text' : 'text-gray-400 dark:text-dark-text2'
                    )}>
                      {lastMsg.sender_id === currentUserId ? 'Tú: ' : ''}{lastMsg.content}
                    </p>
                  )}
                </div>

                {hasUnread && (
                  <div className="flex-shrink-0 h-2.5 w-2.5 rounded-full bg-violet-500" />
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
