import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await (supabase as any)
    .from('rehearsals')
    .select(`
      *,
      creator:profiles!creator_id(id, username, full_name, avatar_url),
      invites:rehearsal_invites(
        id, user_id, status,
        user:profiles!user_id(id, username, full_name, avatar_url)
      )
    `)
    .eq('id', params.id)
    .eq('status', 'active')
    .single()

  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
