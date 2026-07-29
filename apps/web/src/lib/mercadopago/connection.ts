// Baja de la conexión de Mercado Pago de un profesor, con reparación de las
// clases que quedarían sin ninguna vía de pago (P2-4 del audit).
//
// El problema: `classes.accepts_mp = true` no sirve de nada si el profesor no
// tiene (o dejó de tener) cuenta MP conectada. `/api/class/enroll` ya bloquea
// inscripciones NUEVAS en ese caso (`no_payment_method`), que es lo correcto,
// pero **los alumnos ya inscritos con pago pendiente quedaban sin ninguna forma
// de pagar**: la pantalla de pago no les ofrece transferencia (la clase la tiene
// desactivada) ni Mercado Pago (el profesor ya no está conectado). Cupo tomado,
// deuda viva y ningún botón.
//
// La reparación: activar la transferencia en esas clases. Es el único arreglo
// que deja la clase pagable sin inventar una decisión del profesor sobre el
// precio, y respeta el CHECK `classes_payment_method_check` ("al menos una
// vía"). Si además el profesor no tiene datos bancarios cargados, la
// transferencia tampoco muestra nada útil: eso NO se puede reparar solo, así
// que se devuelve como aviso para que la UI (o la notificación del cron) se lo
// diga explícitamente.

import type { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

type AdminClient = ReturnType<typeof createAdminClient>

export interface MpDisconnectSummary {
  /** Clases activas que pasaron a aceptar transferencia para no quedar impagables. */
  classesRepaired: number
  /** Inscripciones con pago pendiente en esas clases (alumnos afectados). */
  affectedStudents: number
  /** Si el profesor tiene datos bancarios: sin ellos la transferencia no alcanza. */
  hasPaymentInfo: boolean
}

/**
 * Deja al profesor como "no conectado a Mercado Pago" y repara sus clases.
 *
 * @param deleteTokens `true` cuando el profesor desconecta a mano (los tokens ya
 *   no sirven para nada). `false` cuando la conexión venció sola: la fila se
 *   conserva para que el cron pueda seguir intentando el refresh y para no
 *   perder el `mp_user_id` (que impide vincular esa cuenta a otro profesor).
 */
export async function markMpDisconnected(
  admin: AdminClient,
  teacherId: string,
  { deleteTokens }: { deleteTokens: boolean }
): Promise<MpDisconnectSummary> {
  if (deleteTokens) {
    await (admin as any).from('teacher_mp_connections').delete().eq('teacher_id', teacherId)
  }
  await (admin as any).from('profiles').update({ mp_connected: false }).eq('id', teacherId)

  // Clases que quedarían sin vía de pago: MP marcado y transferencia apagada.
  const { data: stranded } = await (admin as any)
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('accepts_mp', true)
    .eq('accepts_transfer', false)
    // 'completed' incluida a propósito: la clase ya no admite inscripciones,
    // pero puede tener deuda viva de alumnos que sí alcanzaron a inscribirse.
    .in('status', ['active', 'completed'])

  const ids = ((stranded as { id: string }[]) ?? []).map((c) => c.id)

  let affectedStudents = 0
  if (ids.length > 0) {
    const { count } = await (admin as any)
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .in('class_id', ids)
      .in('status', ['pending_payment', 'payment_submitted'])
    affectedStudents = count ?? 0

    const { error } = await (admin as any)
      .from('classes')
      .update({ accepts_transfer: true })
      .in('id', ids)

    if (error) {
      logger.error('mp_disconnect_repair_failed', error, { teacher_id: teacherId, classes: ids.length })
    } else {
      logger.warn('mp_disconnect_classes_repaired', {
        teacher_id: teacherId,
        classes: ids.length,
        affected_students: affectedStudents,
      })
    }
  }

  const { data: paymentInfo } = await (admin as any)
    .from('teacher_payment_info')
    .select('id')
    .eq('teacher_id', teacherId)
    .maybeSingle()

  return {
    classesRepaired: ids.length,
    affectedStudents,
    hasPaymentInfo: !!paymentInfo,
  }
}
