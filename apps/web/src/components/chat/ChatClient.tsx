'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'

type Message = {
  id: string
  content: string
  created_at: string
  sender: { id: string; full_name: string; username: string; avatar_url: string | null }
}

type Participant = {
  user_id: string
  user: { id: string; full_name: string; username: string; avatar_url: string | null }
}

type ChatClientProps = {
  chatId: string
  chat: any
  currentUserId: string
  participants: Participant[]
  initialMessages: Message[]
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function formatMsgDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}

export default function ChatClient({ chatId, chat, currentUserId, participants, initialMessages }: ChatClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chatTitle = chat.type === 'class'
    ? chat.class?.title ?? 'Chat de clase'
    : chat.rehearsal?.title ?? 'Chat de ensayo'

  const isGroup = chat.type === 'rehearsal'
  const otherParticipant = isGroup ? null
    : participants.find((p) => p.user_id !== currentUserId)?.user
  const me = participants.find((p) => p.user_id === currentUserId)?.user
    ?? { id: currentUserId, full_name: 'Yo', username: '', avatar_url: null }

  const backHref = chat.type === 'class' && chat.class_id
    ? `/class/${chat.class_id}`
    : '/my-classes'

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const newMsg = payload.new as any
          // Fetch sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single()

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, sender: sender ?? { id: newMsg.sender_id, full_name: '?', username: '?', avatar_url: null } }]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [chatId])

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')
    setSendError(null)

    const supabase = createClient()
    // `.select()` para (a) detectar el error —antes se descartaba y el mensaje
    // desaparecía sin decir nada— y (b) pintar el mensaje de inmediato. Sin el
    // append optimista, el remitente depende de que Realtime le devuelva su
    // propia fila; el dedupe por id evita el duplicado cuando llega.
    const { data, error } = await (supabase as any)
      .from('chat_messages')
      .insert({ chat_id: chatId, sender_id: currentUserId, content })
      .select('id, content, created_at, sender_id')
      .single()

    if (error) {
      setText(content)
      setSendError('No se pudo enviar el mensaje. Intenta de nuevo.')
    } else if (data) {
      setMessages((prev) => (
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...data, sender: me }]
      ))
    }

    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date
  const groupedMessages: Array<{ date: string; msgs: Message[] }> = []
  for (const msg of messages) {
    const dateLabel = formatMsgDate(msg.created_at)
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && last.date === dateLabel) {
      last.msgs.push(msg)
    } else {
      groupedMessages.push({ date: dateLabel, msgs: [msg] })
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white dark:bg-dark-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface flex-shrink-0">
        <Link href={backHref} className="flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors flex-shrink-0">
          <ArrowLeft className="h-4 w-4 text-gray-600 dark:text-dark-text2" />
        </Link>
        <div className="flex-1 min-w-0">
          {isGroup ? (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{chatTitle}</p>
            </div>
          ) : otherParticipant ? (
            <div className="flex items-center gap-2">
              <Avatar src={otherParticipant.avatar_url} name={otherParticipant.full_name} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{otherParticipant.full_name}</p>
                <p className="text-xs text-gray-500 dark:text-dark-text2 truncate">{chatTitle}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{chatTitle}</p>
          )}
        </div>
        {isGroup && (
          <span className="text-xs text-gray-400 dark:text-dark-text2 flex-shrink-0">{participants.length} participantes</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-dark-surface flex items-center justify-center mb-4">
              <Send className="h-8 w-8 text-gray-300 dark:text-dark-text2" />
            </div>
            <p className="text-sm text-gray-500 dark:text-dark-text2">Sé el primero en escribir 👋</p>
          </div>
        )}
        {groupedMessages.map(({ date, msgs }) => (
          <div key={date}>
            <div className="flex justify-center my-3">
              <span className="text-xs text-gray-400 dark:text-dark-text2 bg-gray-100 dark:bg-dark-surface2 rounded-full px-3 py-1">{date}</span>
            </div>
            {msgs.map((msg, i) => {
              const isMe = msg.sender.id === currentUserId
              const prevMsg = i > 0 ? msgs[i - 1] : null
              const showAvatar = !isMe && (!prevMsg || prevMsg.sender.id !== msg.sender.id)
              return (
                <div key={msg.id} className={cn('flex gap-2 mb-1', isMe ? 'flex-row-reverse' : 'flex-row')}>
                  <div className="flex-shrink-0 w-7">
                    {showAvatar && !isMe && (
                      <Avatar src={msg.sender.avatar_url} name={msg.sender.full_name} size="xs" />
                    )}
                  </div>
                  <div className={cn('max-w-[72%]', isMe ? 'items-end' : 'items-start', 'flex flex-col')}>
                    {showAvatar && !isMe && isGroup && (
                      <p className="text-[11px] text-gray-500 dark:text-dark-text2 mb-0.5 px-1">{msg.sender.full_name}</p>
                    )}
                    <div className={cn(
                      'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                      isMe
                        ? 'bg-violet-500 text-white rounded-tr-sm'
                        : 'bg-gray-100 dark:bg-dark-surface2 text-gray-900 dark:text-dark-text rounded-tl-sm'
                    )}>
                      {msg.content}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-dark-text2 mt-0.5 px-1">{formatMsgTime(msg.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {sendError && (
        <div className="px-4 pt-2 flex-shrink-0">
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {sendError}
          </p>
        </div>
      )}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          maxLength={1000}
          className="flex-1 rounded-2xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2 px-4 py-2.5 text-sm text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-text2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <button
          onClick={handleSend}
          aria-label="Enviar mensaje"
          disabled={!text.trim() || sending}
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition-colors hover:bg-violet-600',
            (!text.trim() || sending) && 'opacity-50'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
