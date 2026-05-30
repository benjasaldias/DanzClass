import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'

// POST /api/event/respond-invite
// body: { event_id: string, status: 'accepted' | 'rejected' }
export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error

  const body = await request.json().catch(() => ({}))
  const { event_id, status } = body

  if (!event_id || !['accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify the invite exists for this teacher
  const { data: invite } = await (admin as any)
    .from('event_invites')
    .select('id, event_id')
    .eq('event_id', event_id)
    .eq('teacher_id', authed.user.id)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  // Update invite status
  const { error } = await (admin as any)
    .from('event_invites')
    .update({ status })
    .eq('id', invite.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify event creator
  const { data: event } = await (admin as any)
    .from('events')
    .select('creator_id')
    .eq('id', event_id)
    .maybeSingle()

  if (event?.creator_id && event.creator_id !== authed.user.id) {
    const notifType = status === 'accepted' ? 'event_invite_accepted' : 'event_invite_rejected'
    try {
      await admin.from('notifications').insert({
        user_id: event.creator_id,
        type: notifType,
        data: { event_id, teacher_id: authed.user.id },
      } as any)
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, status })
}
