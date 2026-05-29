import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/chat/list — list all chats for the current user with last message preview
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  const { data: participations } = await (admin as any)
    .from('chat_participants')
    .select(`
      chat_id, last_read_at,
      chat:chats(
        id, type, class_id, rehearsal_id, student_id, created_at,
        class:classes(id, title, teacher_id, teacher:profiles!teacher_id(full_name, username, avatar_url)),
        rehearsal:rehearsals(id, title, creator_id)
      )
    `)
    .eq('user_id', auth.user.id)

  const chats = ((participations ?? []) as any[]).map((p: any) => p.chat).filter(Boolean)

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
