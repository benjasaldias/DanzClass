import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// POST /api/mercadopago/oauth/disconnect
// Desvincula la cuenta MP del profesor (borra tokens + baja el flag público).
// Soporta cookie (web) y Bearer (mobile).
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  const admin = createAdminClient()
  await (admin as any).from('teacher_mp_connections').delete().eq('teacher_id', userId)
  await (admin as any).from('profiles').update({ mp_connected: false }).eq('id', userId)

  logger.info('mp_oauth_disconnected', { teacher_id: userId })
  return NextResponse.json({ ok: true })
}
