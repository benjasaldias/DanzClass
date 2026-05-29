import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ChatClient from '@/components/chat/ChatClient'

export default async function ChatPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()
  const chatId = params.id

  // Verify participant
  const { data: participant } = await (admin as any)
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant) redirect('/my-classes')

  // Fetch chat info
  const { data: chat } = await (admin as any)
    .from('chats')
    .select(`
      id, type, class_id, rehearsal_id, student_id,
      class:classes(id, title, teacher_id, teacher:profiles!teacher_id(full_name, username, avatar_url)),
      rehearsal:rehearsals(id, title)
    `)
    .eq('id', chatId)
    .single()

  if (!chat) redirect('/my-classes')

  // Fetch all participants with profiles
  const { data: participants } = await (admin as any)
    .from('chat_participants')
    .select('user_id, joined_at, user:profiles!user_id(id, full_name, username, avatar_url)')
    .eq('chat_id', chatId)

  // Fetch initial messages
  const { data: messages } = await (admin as any)
    .from('chat_messages')
    .select(`
      id, content, created_at,
      sender:profiles!sender_id(id, full_name, username, avatar_url)
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(50)

  // Update last_read_at
  await (admin as any)
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', user.id)

  return (
    <ChatClient
      chatId={chatId}
      chat={chat}
      currentUserId={user.id}
      participants={(participants ?? []) as any[]}
      initialMessages={(messages ?? []) as any[]}
    />
  )
}
