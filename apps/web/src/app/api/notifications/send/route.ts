import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'

// Tipos que un usuario autenticado puede enviar a otros usuarios (acciones sociales).
// Los tipos de pago/cron quedan FUERA — solo se insertan desde API routes server-side específicas.
const SENDER_INITIATED_TYPES = new Set([
  'follow',
  'friend_request',
  'friend_accepted',
  'new_class',
  'class_updated',
  'class_cancelled',
  'new_audition',
  'audition_accepted',
  'audition_rejected',
  'payment_confirmed',
  'payment_rejected',
])

type NotifInput = { user_id: string; type: string; data: Record<string, any> }

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const senderId = authed.user.id

  const body = await request.json().catch(() => ({}))
  const rawNotifs: NotifInput[] = Array.isArray(body?.notifications)
    ? body.notifications
    : body && typeof body === 'object' && body.user_id
      ? [body]
      : []

  if (rawNotifs.length === 0) {
    return NextResponse.json({ error: 'No notifications provided' }, { status: 400 })
  }
  if (rawNotifs.length > 500) {
    return NextResponse.json({ error: 'Too many recipients in single request' }, { status: 400 })
  }

  // Todas las notificaciones del batch deben compartir tipo + class_id (cuando aplique)
  // para que la validación de ownership se haga una sola vez.
  const types = new Set(rawNotifs.map((n) => n.type))
  if (types.size > 1) {
    return NextResponse.json({ error: 'Batch must share a single type' }, { status: 400 })
  }
  const type = rawNotifs[0].type
  if (!SENDER_INITIATED_TYPES.has(type)) {
    return NextResponse.json({ error: `Type "${type}" cannot be sent by clients` }, { status: 403 })
  }

  const admin = createAdminClient()

  // Validaciones por tipo
  if (type === 'follow' || type === 'friend_request' || type === 'friend_accepted') {
    // data.from_user_id debe coincidir con el sender
    const bad = rawNotifs.find((n) => n.data?.from_user_id !== senderId)
    if (bad) return NextResponse.json({ error: 'Sender mismatch in data.from_user_id' }, { status: 403 })
  } else if (
    type === 'new_class' ||
    type === 'class_updated' ||
    type === 'class_cancelled' ||
    type === 'audition_accepted' ||
    type === 'audition_rejected' ||
    type === 'payment_confirmed' ||
    type === 'payment_rejected'
  ) {
    // Sender debe ser teacher de la clase referenciada en data.class_id
    const classIds = Array.from(new Set(rawNotifs.map((n) => n.data?.class_id).filter(Boolean)))
    if (classIds.length !== 1) {
      return NextResponse.json({ error: 'Batch must reference exactly one class_id' }, { status: 400 })
    }
    const { data: cls } = await admin
      .from('classes')
      .select('id, teacher_id')
      .eq('id', classIds[0])
      .maybeSingle()
    if (!cls || (cls as any).teacher_id !== senderId) {
      return NextResponse.json({ error: 'Not the teacher of this class' }, { status: 403 })
    }
  } else if (type === 'new_audition') {
    // Sender debe haber postulado a esa clase
    const classId = rawNotifs[0]?.data?.class_id
    if (!classId) return NextResponse.json({ error: 'Missing class_id' }, { status: 400 })
    const { data: aud } = await (admin as any)
      .from('auditions')
      .select('id')
      .eq('class_id', classId)
      .eq('applicant_id', senderId)
      .maybeSingle()
    if (!aud) return NextResponse.json({ error: 'No audition found for this class' }, { status: 403 })
    // El destinatario debe ser el teacher de la clase
    const { data: cls } = await admin
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .maybeSingle()
    if (!cls || rawNotifs.some((n) => n.user_id !== (cls as any).teacher_id)) {
      return NextResponse.json({ error: 'Recipient must be the teacher' }, { status: 403 })
    }
  }

  const rows = rawNotifs.map((n) => ({ user_id: n.user_id, type: n.type, data: n.data ?? {} }))
  const { error } = await admin.from('notifications').insert(rows as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: rows.length })
}
