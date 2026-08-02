import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelBillableSubscriptions } from '@/lib/subscriptionCancel'

// P1-5: usaba `createClient()` (solo cookie), así que mobile — que manda
// Bearer — recibía 401 siempre. No había forma de cancelar la suscripción
// desde la app, aunque la pantalla de planes prometiera "Podés cancelar en
// cualquier momento". Mismo defecto que `audit.md` S7 ya había encontrado en
// `/api/rehearsal/respond`.
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const result = await cancelBillableSubscriptions(admin, auth.user.id, 'subscription_cancel')

  if (!result.ok) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
