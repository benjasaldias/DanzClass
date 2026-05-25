import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invite_id, status } = await req.json()

  if (!['accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Bypass RLS with admin client; verify ownership manually
  const { data: invite, error: fetchErr } = await (admin as any)
    .from('rehearsal_invites')
    .select('*, rehearsal:rehearsals(id, title, creator_id)')
    .eq('id', invite_id)
    .single()

  if (fetchErr || !invite) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  if (invite.user_id !== user.id) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })

  await (admin as any)
    .from('rehearsal_invites')
    .update({ status })
    .eq('id', invite_id)

  // Notify the creator
  const notifType = status === 'accepted' ? 'rehearsal_accepted' : 'rehearsal_rejected'
  const { data: responderProfile } = await admin
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .single()

  await (admin as any).from('notifications').insert({
    user_id: invite.rehearsal.creator_id,
    type: notifType,
    data: {
      rehearsal_id: invite.rehearsal.id,
      rehearsal_title: invite.rehearsal.title,
      from_user_id: user.id,
      from_username: responderProfile?.username ?? '',
      from_full_name: responderProfile?.full_name ?? '',
    },
    read: false,
  })

  return NextResponse.json({ ok: true })
}
