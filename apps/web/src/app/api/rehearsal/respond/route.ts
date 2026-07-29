import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { notifyUsers } from '@/lib/notifyUsers'

export async function POST(req: Request) {
  // `createClient()` sólo autentica por cookie: mobile manda Bearer, así que
  // aceptar o rechazar una invitación a ensayo desde la app respondía 401 —y el
  // cliente sólo miraba `res.ok`, con lo que el botón no hacía nada y tampoco
  // decía por qué. `requireUser` acepta las dos vías.
  const authed = await requireUser(req)
  if ('error' in authed) return authed.error
  const user = authed.user

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

  await notifyUsers(admin, [{
    user_id: invite.rehearsal.creator_id,
    type: notifType,
    data: {
      rehearsal_id: invite.rehearsal.id,
      rehearsal_title: invite.rehearsal.title,
      from_user_id: user.id,
      from_username: responderProfile?.username ?? '',
      from_full_name: responderProfile?.full_name ?? '',
    },
  }])

  return NextResponse.json({ ok: true })
}
