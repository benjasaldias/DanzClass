import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'
import { z } from 'zod'

const RehearsalSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(100),
  description: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  date_mode: z.enum(['single', 'custom', 'coordinate']),
  rehearsal_date: z.string().max(10).optional().nullable(),
  rehearsal_time: z.string().max(5).optional().nullable(),
  custom_dates: z.array(z.string().max(10)).max(60).optional().nullable(),
  coordinate_month: z.string().max(7).optional().nullable(),
  duration_minutes: z.number().int().min(10).max(480).optional(),
  invite_ids: z.array(z.string().uuid()).max(100).optional(),
})

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rlHit = await checkRateLimit(`rehearsal:${user.id}`, 'social')
  if (rlHit) return rlHit

  const rawBody = await req.json().catch(() => null)
  const parsed = RehearsalSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { title, description, city, location, date_mode, rehearsal_date, rehearsal_time, custom_dates, coordinate_month, duration_minutes, invite_ids } = parsed.data

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
      type: 'rehearsal_invite' as const,
      data: {
        rehearsal_id: rehearsal.id,
        rehearsal_title: rehearsal.title,
        from_user_id: user.id,
        from_username: creatorProfile?.username ?? '',
        from_full_name: creatorProfile?.full_name ?? '',
      },
    }))
    await notifyUsers(admin, notifRows)
  }

  return NextResponse.json({ ok: true, rehearsal })
}
