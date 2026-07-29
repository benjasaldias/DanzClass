import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { markMpDisconnected } from '@/lib/mercadopago/connection'
import { logger } from '@/lib/logger'

// POST /api/mercadopago/oauth/disconnect
// Desvincula la cuenta MP del profesor (borra tokens + baja el flag público).
// Soporta cookie (web) y Bearer (mobile).
//
// P2-4: desconectar dejaba clases con `accepts_mp=true, accepts_transfer=false`,
// o sea alumnos ya inscritos con pago pendiente y NINGUNA vía para pagar.
// `markMpDisconnected` activa la transferencia en esas clases y devuelve el
// resumen para que la UI pueda avisar cuando además faltan los datos bancarios
// (único caso que no se puede reparar solo).
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  const admin = createAdminClient()
  const summary = await markMpDisconnected(admin, userId, { deleteTokens: true })

  logger.info('mp_oauth_disconnected', { teacher_id: userId, ...summary })
  return NextResponse.json({ ok: true, ...summary })
}
