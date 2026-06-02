import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { sendPushToUsers } from '@/lib/push'
import { checkRateLimit } from '@/lib/rateLimit'

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
  'event_invite',
  'event_invite_accepted',
  'event_invite_rejected',
])

type NotifInput = { user_id: string; type: string; data: Record<string, any> }

// Human-readable push notification labels per type
const PUSH_LABELS: Record<string, { title: string; body: string | ((data: any) => string) }> = {
  follow: { title: 'Nuevo seguidor', body: (d) => `@${d.from_username ?? 'Alguien'} empezó a seguirte` },
  friend_request: { title: 'Solicitud de amistad', body: (d) => `@${d.from_username ?? 'Alguien'} quiere ser tu amigo/a` },
  friend_accepted: { title: 'Solicitud aceptada', body: (d) => `@${d.from_username ?? 'Alguien'} aceptó tu solicitud de amistad` },
  new_class: { title: 'Nueva clase', body: (d) => `${d.teacher_name ?? 'Un profe'} publicó una nueva clase` },
  class_updated: { title: 'Clase actualizada', body: (d) => `La clase "${d.class_title ?? ''}" fue actualizada` },
  class_cancelled: { title: 'Clase cancelada', body: (d) => `La clase "${d.class_title ?? ''}" fue cancelada` },
  class_discount: { title: 'Descuento activo 🔥', body: (d) => `¡Descuento en la clase "${d.class_title ?? ''}"!` },
  payment_confirmed: { title: 'Pago confirmado ✅', body: (d) => `Tu pago para "${d.class_title ?? 'una clase'}" fue confirmado` },
  payment_rejected: { title: 'Pago rechazado', body: (d) => `Tu pago para "${d.class_title ?? 'una clase'}" fue rechazado` },
  audition_accepted: { title: 'Audición aceptada ✅', body: (d) => `¡Fuiste aceptad@ en "${d.class_title ?? 'el entrenamiento'}"!` },
  audition_rejected: { title: 'Audición rechazada', body: (d) => `Tu postulación a "${d.class_title ?? 'el entrenamiento'}" no fue seleccionada` },
  new_audition: { title: 'Nueva postulación', body: (d) => `Alguien postuló a tu entrenamiento "${d.class_title ?? ''}"` },
  event_invite: { title: 'Invitación a evento 🏆', body: (d) => `Te invitaron a participar en "${d.event_title ?? 'un evento'}"` },
  event_invite_accepted: { title: 'Invitación aceptada', body: 'Un profe aceptó tu invitación al evento' },
  event_invite_rejected: { title: 'Invitación declinada', body: 'Un profe declinó tu invitación al evento' },
}

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const senderId = authed.user.id

  // Rate limit: social actions use stricter limit per type
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

  // Rate limit: social types (follow/friend) are stricter; class_discount has per-class key
  const isSocial = type === 'follow' || type === 'friend_request' || type === 'friend_accepted'
  const isDiscount = type === 'class_discount'
  const classId = rawNotifs[0]?.data?.class_id ?? ''
  const rateLimitKey = isDiscount ? `notif:discount:${senderId}:${classId}` : `notif:${senderId}`
  const rateLimitType = isSocial ? 'social' : isDiscount ? 'discount' : 'notif'
  const limitHit = await checkRateLimit(rateLimitKey, rateLimitType)
  if (limitHit) return limitHit

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
  } else if (type === 'event_invite') {
    // Sender debe ser el creator del evento
    const eventId = rawNotifs[0]?.data?.event_id
    if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
    const { data: ev } = await (admin as any)
      .from('events').select('creator_id').eq('id', eventId).maybeSingle()
    if (!ev || ev.creator_id !== senderId) {
      return NextResponse.json({ error: 'Not the creator of this event' }, { status: 403 })
    }
  } else if (type === 'event_invite_accepted' || type === 'event_invite_rejected') {
    // Sender debe tener una invite al evento
    const eventId = rawNotifs[0]?.data?.event_id
    if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
    const { data: invite } = await (admin as any)
      .from('event_invites').select('id').eq('event_id', eventId).eq('teacher_id', senderId).maybeSingle()
    if (!invite) return NextResponse.json({ error: 'No invite found' }, { status: 403 })
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

  // Fire push notifications (best-effort, non-blocking)
  const userIds = rows.map((r) => r.user_id)
  const pushLabel = PUSH_LABELS[type]
  if (pushLabel) {
    sendPushToUsers(userIds, {
      title: pushLabel.title,
      body: typeof pushLabel.body === 'function' ? pushLabel.body(rawNotifs[0].data ?? {}) : pushLabel.body,
      data: { type, ...(rawNotifs[0].data ?? {}) },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
