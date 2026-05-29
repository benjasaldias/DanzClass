import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/chat/[id]/messages — fetch last 50 messages (pagination via cursor)
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const chatId = params.id

  // Verify participant
  const { data: participant } = await (admin as any)
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!participant) return NextResponse.json({ error: 'not_participant' }, { status: 403 })

  const url = new URL(request.url)
  const before = url.searchParams.get('before') // ISO timestamp cursor

  let query = (admin as any)
    .from('chat_messages')
    .select(`
      id, content, created_at,
      sender:profiles!sender_id(id, full_name, username, avatar_url)
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages } = await query

  // Update last_read_at
  await (admin as any)
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', auth.user.id)

  return NextResponse.json({ messages: ((messages ?? []) as any[]).reverse() })
}
