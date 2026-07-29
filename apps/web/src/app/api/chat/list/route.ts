import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/chat/list — list all chats for the current user with last message preview
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  // `participants` y `last_read_at` NO son opcionales para el consumidor de esta
  // ruta (la lista de chats de mobile): sin el primero, un chat 1:1 se pinta con
  // un ícono genérico y el título de la clase en vez del nombre y la foto de la
  // otra persona; sin el segundo, `hasUnread` cae al fallback `!!lastMsg` y el
  // punto de "no leído" queda encendido para siempre. La página web equivalente
  // (`/chats`) ya traía ambos: era una divergencia web↔mobile, no un diseño.
  const { data: participations } = await (admin as any)
    .from('chat_participants')
    .select(`
      chat_id, last_read_at,
      chat:chats(
        id, type, class_id, rehearsal_id, student_id, created_at,
        class:classes(id, title, teacher_id, teacher:profiles!teacher_id(full_name, username, avatar_url)),
        rehearsal:rehearsals(id, title, creator_id),
        participants:chat_participants(user_id, user:profiles!user_id(id, full_name, username, avatar_url))
      )
    `)
    .eq('user_id', auth.user.id)

  const chats = ((participations ?? []) as any[])
    .filter((p: any) => p.chat)
    .map((p: any) => ({ ...p.chat, last_read_at: p.last_read_at }))

  // Fetch last message for each chat
  const chatIds = chats.map((c: any) => c.id)
  const { data: lastMessages } = chatIds.length > 0
    ? await (admin as any)
        .from('chat_messages')
        .select('chat_id, content, created_at, sender_id')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastMsgMap: Record<string, any> = {}
  for (const msg of ((lastMessages ?? []) as any[])) {
    if (!lastMsgMap[msg.chat_id]) lastMsgMap[msg.chat_id] = msg
  }

  // Fetch participant profiles for class chats (the other person)
  const result = []
  for (const chat of chats) {
    const lastMsg = lastMsgMap[chat.id] ?? null
    result.push({ ...chat, last_message: lastMsg })
  }

  result.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at
    const bTime = b.last_message?.created_at ?? b.created_at
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  return NextResponse.json({ chats: result })
}
