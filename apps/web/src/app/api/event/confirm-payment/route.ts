import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'

// POST /api/event/confirm-payment
// body: { enrollment_id: string, action: 'confirm' | 'reject' }
//
// El organizador confirmaba desde el cliente con dos UPDATE sueltos
// (`event_enrollments` y `event_payments`) y el alumno NO SE ENTERABA: ninguna
// notificación, ningún push. Además, si el segundo update fallaba, la
// inscripción quedaba confirmada con el pago sin verificar. Acá el estado lo
// decide el servidor, se avisa al alumno, y rechazar existe como acción real (el
// cliente sólo sabía confirmar).
export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error

  const rlHit = await checkRateLimit(`event-confirm:${authed.user.id}`, 'notif')
  if (rlHit) return rlHit

  const body = await request.json().catch(() => ({}))
  const { enrollment_id, action } = body as { enrollment_id?: string; action?: 'confirm' | 'reject' }

  if (!enrollment_id || (action !== 'confirm' && action !== 'reject')) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: enrollment } = await (admin as any)
    .from('event_enrollments')
    .select('id, user_id, status, event:events!inner(id, title, creator_id, has_entry)')
    .eq('id', enrollment_id)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (enrollment.event?.creator_id !== authed.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const confirming = action === 'confirm'

  await (admin as any)
    .from('event_enrollments')
    .update({ status: confirming ? 'confirmed' : 'pending_payment' })
    .eq('id', enrollment_id)

  // `event_payments.status` sólo admite pending/submitted/verified/void (038):
  // un comprobante rechazado queda 'void' —deja de aplicar— y la pantalla del
  // alumno vuelve a ofrecerle subir uno nuevo.
  await (admin as any)
    .from('event_payments')
    .update({ status: confirming ? 'verified' : 'void' })
    .eq('enrollment_id', enrollment_id)

  await notifyUsers(admin, [{
    user_id: enrollment.user_id,
    type: confirming ? 'payment_confirmed' : 'payment_rejected',
    data: { event_id: enrollment.event.id, event_title: enrollment.event.title },
  }])

  return NextResponse.json({ ok: true, status: confirming ? 'confirmed' : 'pending_payment' })
}
