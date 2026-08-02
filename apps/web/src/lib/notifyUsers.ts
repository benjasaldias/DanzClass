import { createAdminClient } from './supabase/admin'
import { sendPushToUsers } from './push'
import type { NotificationType } from '@danceclass/shared'

type AdminClient = ReturnType<typeof createAdminClient>
export type NotifyRow = { user_id: string; type: NotificationType; data: Record<string, any> }

// Copy de push por tipo de notificación. Fuente única (antes vivía duplicada
// solo para los tipos que un cliente puede disparar vía /api/notifications/send;
// D-6 la centraliza acá para que `notifyUsers` la reutilice en las rutas
// server-side que insertaban notificaciones directo sin avisar por push).
export const PUSH_LABELS: Record<string, { title: string; body: string | ((data: any) => string) }> = {
  follow: { title: 'Nuevo seguidor', body: (d) => `@${d.from_username ?? 'Alguien'} empezó a seguirte` },
  friend_request: { title: 'Solicitud de amistad', body: (d) => `@${d.from_username ?? 'Alguien'} quiere ser tu amigo/a` },
  friend_accepted: { title: 'Solicitud aceptada', body: (d) => `@${d.from_username ?? 'Alguien'} aceptó tu solicitud de amistad` },
  new_class: { title: 'Nueva clase', body: (d) => `${d.teacher_name ?? 'Un profe'} publicó una nueva clase` },
  class_updated: { title: 'Clase actualizada', body: (d) => `La clase "${d.class_title ?? ''}" fue actualizada` },
  class_cancelled: { title: 'Clase cancelada', body: (d) => d.class_title ? `La clase "${d.class_title}" fue cancelada` : 'Una de tus clases fue cancelada' },
  class_discount: { title: 'Descuento activo 🔥', body: (d) => `¡Descuento en la clase "${d.class_title ?? ''}"!` },
  payment_confirmed: { title: 'Pago confirmado ✅', body: (d) => `Tu pago para "${d.class_title ?? 'una clase'}" fue confirmado` },
  payment_rejected: { title: 'Pago rechazado', body: (d) => `Tu pago para "${d.class_title ?? 'una clase'}" fue rechazado` },
  audition_accepted: { title: 'Audición aceptada ✅', body: (d) => `¡Fuiste aceptad@ en "${d.class_title ?? 'el entrenamiento'}"!` },
  audition_rejected: { title: 'Audición rechazada', body: (d) => `Tu postulación a "${d.class_title ?? 'el entrenamiento'}" no fue seleccionada` },
  new_audition: { title: 'Nueva postulación', body: (d) => `Alguien postuló a tu entrenamiento "${d.class_title ?? ''}"` },
  event_invite: { title: 'Invitación a evento 🏆', body: (d) => `Te invitaron a participar en "${d.event_title ?? 'un evento'}"` },
  event_invite_accepted: { title: 'Invitación aceptada', body: 'Un profe aceptó tu invitación al evento' },
  event_invite_rejected: { title: 'Invitación declinada', body: 'Un profe declinó tu invitación al evento' },
  waitlist_available: { title: 'Se liberó un cupo 🎉', body: (d) => `Hay un cupo libre en "${d.class_title ?? 'una clase'}"` },
  rehearsal_invite: { title: 'Invitación a ensayo', body: (d) => `Te invitaron al ensayo "${d.rehearsal_title ?? ''}"` },
  rehearsal_accepted: { title: 'Invitación aceptada', body: (d) => `@${d.from_username ?? 'Alguien'} aceptó tu invitación al ensayo "${d.rehearsal_title ?? ''}"` },
  rehearsal_rejected: { title: 'Invitación declinada', body: (d) => `@${d.from_username ?? 'Alguien'} declinó tu invitación al ensayo "${d.rehearsal_title ?? ''}"` },
  new_report: { title: 'Nueva denuncia', body: (d) => `${d.reporter_name ?? 'Alguien'} denunció ${d.content_type === 'post' ? 'un video' : 'una clase'}` },
  class_reminder: { title: 'Tu clase es mañana 📅', body: (d) => `"${d.class_title ?? ''}" es mañana${d.session_time ? ` a las ${d.session_time}` : ''}` },
  payment_reminder: {
    title: 'Recordatorio de pago',
    // Con `role: 'teacher'` el destinatario es el profesor y la deuda no es
    // suya: es un comprobante que lleva días esperando su revisión (audit3 P0-1).
    body: (d) =>
      d.role === 'teacher'
        ? `Tienes un comprobante de "${d.class_title ?? 'una clase'}" sin revisar`
        : `Aún no subes el comprobante de "${d.class_title ?? 'tu clase'}"`,
  },
  debt_warning: { title: 'Alumno con deuda', body: (d) => `${d.student_name ?? 'Un alumno'} tiene una clase suelta impaga contigo` },
  '2x_match': { title: '¡Encontraste compañer@! 🤝', body: (d) => `Alguien se unió a tu búsqueda 2x para "${d.class_title ?? 'una clase'}"` },
  '2x_payment_turn': { title: 'Te toca pagar el 2x', body: 'Tu compañer@ te transfirió el turno de pago' },
}

/**
 * Inserta notificaciones y dispara push best-effort (D-6). Reemplaza el patrón
 * `admin.from('notifications').insert(...)` disperso en 12 rutas que nunca
 * llamaban a `sendPushToUsers` — las notificaciones más urgentes por
 * naturaleza (tu clase es mañana, te queda un día para pagar) eran
 * justamente las que no llegaban como push.
 *
 * El texto del push sale de `PUSH_LABELS[type]` aplicado al `data` de cada
 * fila. Se agrupa por (type + JSON de data) antes de pushear — no solo por
 * type — porque algunos llamadores insertan un batch que mezcla varios
 * eventos distintos en una sola llamada (ej. el cron cancela alumnos de
 * varias clases distintas en la misma corrida): pushear una sola vez con el
 * `data` de la primera fila le habría mandado a todos el título de la
 * primera clase, sin importar cuál era la suya.
 */
export async function notifyUsers(
  admin: AdminClient,
  rows: NotifyRow[]
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null }

  const { error } = await admin.from('notifications').insert(rows as any)
  if (error) return { error: error.message }

  const byGroup = new Map<string, NotifyRow[]>()
  for (const row of rows) {
    const key = `${row.type}::${JSON.stringify(row.data ?? {})}`
    const group = byGroup.get(key)
    if (group) group.push(row)
    else byGroup.set(key, [row])
  }

  for (const groupRows of byGroup.values()) {
    const { type, data } = groupRows[0]
    const label = PUSH_LABELS[type]
    if (!label) continue
    sendPushToUsers(groupRows.map((r) => r.user_id), {
      title: label.title,
      body: typeof label.body === 'function' ? label.body(data ?? {}) : label.body,
      data: { type, ...(data ?? {}) },
    }).catch(() => {})
  }

  return { error: null }
}
