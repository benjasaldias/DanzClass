import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, city, location, date_mode, rehearsal_date, rehearsal_time, custom_dates, coordinate_month, duration_minutes, invite_ids } = body

  if (!title?.trim()) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
  if (!['single', 'custom', 'coordinate'].includes(date_mode)) {
    return NextResponse.json({ error: 'date_mode inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: rehearsal, error } = await (admin as any)
    .from('rehearsals')
    .insert({
      creator_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      city: city?.trim() || null,
      location: location?.trim() || null,
      date_mode,
      rehearsal_date: date_mode === 'single' ? rehearsal_date || null : null,
      rehearsal_time: date_mode === 'single' ? rehearsal_time || null : null,
      custom_dates: date_mode === 'custom' ? (custom_dates ?? []) : null,
      coordinate_month: date_mode === 'coordinate' ? coordinate_month || null : null,
      duration_minutes: duration_minutes ?? 60,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invite users (send rehearsal_invite notifications)
  const validInviteIds: string[] = (invite_ids ?? []).filter((id: string) => id && id !== user.id)

  if (validInviteIds.length > 0) {
    const inviteRows = validInviteIds.map((uid: string) => ({
      rehearsal_id: rehearsal.id,
      user_id: uid,
      status: 'pending',
    }))
    await (admin as any).from('rehearsal_invites').insert(inviteRows)

    // Fetch creator profile for notification
    const { data: creatorProfile } = await admin
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single()

    const notifRows = validInviteIds.map((uid: string) => ({
      user_id: uid,
      type: 'rehearsal_invite',
      data: {
        rehearsal_id: rehearsal.id,
        rehearsal_title: rehearsal.title,
        from_user_id: user.id,
        from_username: creatorProfile?.username ?? '',
        from_full_name: creatorProfile?.full_name ?? '',
      },
      read: false,
    }))
    await (admin as any).from('notifications').insert(notifRows)
  }

  return NextResponse.json({ ok: true, rehearsal })
}
