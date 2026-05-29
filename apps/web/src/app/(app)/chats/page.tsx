import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ChatsListClient from '@/components/chat/ChatsListClient'

export default async function ChatsListPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  const { data: participations } = await (admin as any)
    .from('chat_participants')
    .select(`
      chat_id, last_read_at,
      chat:chats(
        id, type, class_id, rehearsal_id, student_id, created_at,
        class:classes(id, title, teacher_id, teacher:profiles!teacher_id(full_name, username, avatar_url)),
        rehearsal:rehearsals(id, title),
        participants:chat_participants(user_id, user:profiles!user_id(id, full_name, username, avatar_url))
      )
    `)
    .eq('user_id', user.id)

  const chats = ((participations ?? []) as any[]).map((p: any) => ({
    ...p.chat,
    last_read_at: p.last_read_at,
  })).filter(Boolean)

  // Fetch last message per chat
  const chatIds = chats.map((c: any) => c.id)
  const lastMsgMap: Record<string, any> = {}
  if (chatIds.length > 0) {
    const { data: lastMessages } = await (admin as any)
      .from('chat_messages')
      .select('chat_id, content, created_at, sender_id')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false })

    for (const msg of ((lastMessages ?? []) as any[])) {
      if (!lastMsgMap[msg.chat_id]) lastMsgMap[msg.chat_id] = msg
    }
  }

  const chatsWithLastMsg = chats
    .map((c: any) => ({ ...c, last_message: lastMsgMap[c.id] ?? null }))
    .sort((a: any, b: any) => {
      const aTime = a.last_message?.created_at ?? a.created_at
      const bTime = b.last_message?.created_at ?? b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

  return <ChatsListClient chats={chatsWithLastMsg} currentUserId={user.id} />
}
