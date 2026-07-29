import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'
import { z } from 'zod'

// P1-3: sin esto, cualquier autenticado podía enumerar ids via Explorar
// (`profiles_select_all` es `USING (true)`) y postear miles de un golpe —
// mismo tope y validación de formato que ya tiene `/api/rehearsal/create`.
const InviteSchema = z.object({
  rehearsal_id: z.string().uuid(),
  user_ids: z.array(z.string().uuid()).max(100),
})

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rlHit = await checkRateLimit(`rehearsal:${user.id}`, 'social')
  if (rlHit) return rlHit

  const rawBody = await req.json().catch(() => null)
  const parsed = InviteSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { rehearsal_id, user_ids } = parsed.data

  // Verify current user is the creator
  const { data: rehearsal } = await (supabase as any)
    .from('rehearsals')
    .select('id, title, creator_id')
    .eq('id', rehearsal_id)
    .eq('creator_id', user.id)
    .single()

  if (!rehearsal) return NextResponse.json({ error: 'Ensayo no encontrado o sin permisos' }, { status: 404 })

  const admin = createAdminClient()
  const validIds: string[] = user_ids.filter((id) => id !== user.id)

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
    type: 'rehearsal_invite' as const,
    data: {
      rehearsal_id,
      rehearsal_title: rehearsal.title,
      from_user_id: user.id,
      from_username: creatorProfile?.username ?? '',
      from_full_name: creatorProfile?.full_name ?? '',
    },
  }))
  await notifyUsers(admin, notifRows)

  return NextResponse.json({ ok: true })
}
