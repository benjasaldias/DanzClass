import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rehearsal_id, user_ids } = await req.json()

  // Verify current user is the creator
  const { data: rehearsal } = await (supabase as any)
    .from('rehearsals')
    .select('id, title, creator_id')
    .eq('id', rehearsal_id)
    .eq('creator_id', user.id)
    .single()

  if (!rehearsal) return NextResponse.json({ error: 'Ensayo no encontrado o sin permisos' }, { status: 404 })

  const admin = createAdminClient()
  const validIds: string[] = (user_ids ?? []).filter((id: string) => id && id !== user.id)

  if (validIds.length === 0) return NextResponse.json({ ok: true })

  const inviteRows = validIds.map((uid: string) => ({
    rehearsal_id,
    user_id: uid,
    status: 'pending',
  }))

  // Upsert (ignore duplicates)
  await (admin as any)
    .from('rehearsal_invites')
    .upsert(inviteRows, { onConflict: 'rehearsal_id,user_id', ignoreDuplicates: true })

  const { data: creatorProfile } = await admin
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .single()

  const notifRows = validIds.map((uid: string) => ({
    user_id: uid,
    type: 'rehearsal_invite',
    data: {
      rehearsal_id,
      rehearsal_title: rehearsal.title,
      from_user_id: user.id,
      from_username: creatorProfile?.username ?? '',
      from_full_name: creatorProfile?.full_name ?? '',
    },
    read: false,
  }))
  await (admin as any).from('notifications').insert(notifRows)

  return NextResponse.json({ ok: true })
}
