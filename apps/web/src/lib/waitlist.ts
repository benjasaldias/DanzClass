import type { createAdminClient } from './supabase/admin'
import { notifyUsers } from './notifyUsers'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Se liberó un cupo en `classId`: avisa al primero de la fila de espera que
 * TODAVÍA no esté inscrito (audit3 P1-4).
 *
 * Antes, cada punto que liberaba un cupo avisaba siempre al primero por
 * `created_at` sin mirar si ya se había inscrito con un aviso anterior, y
 * nadie borraba esa fila — así que el mismo alumno se llevaba todos los
 * avisos siguientes y el segundo de la fila nunca se enteraba. El borrado
 * "normal" pasa por `/api/class/enroll` (se limpia la fila propia al
 * inscribirse); este helper recorre la cola en orden y salta —sin
 * notificar, pero SÍ borrando— a cualquiera que ya tenga una inscripción
 * activa, por si una fila vieja sobrevivió a una inscripción anterior a
 * este fix.
 */
export async function notifyWaitlist(admin: AdminClient, classId: string): Promise<void> {
  const { data: entries } = await (admin as any)
    .from('waitlist')
    .select('id, user_id')
    .eq('class_id', classId)
    .order('created_at', { ascending: true })

  if (!entries || entries.length === 0) return

  const { data: classInfo } = await admin
    .from('classes')
    .select('id, title')
    .eq('id', classId)
    .maybeSingle()
  if (!classInfo) return

  const { data: activeEnrollments } = await (admin as any)
    .from('enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .is('session_id', null)
    .neq('status', 'cancelled')
  const enrolledIds = new Set(((activeEnrollments ?? []) as any[]).map((e) => e.student_id))

  const staleIds: string[] = []
  let next: { id: string; user_id: string } | null = null
  for (const entry of entries as { id: string; user_id: string }[]) {
    if (enrolledIds.has(entry.user_id)) {
      staleIds.push(entry.id)
      continue
    }
    next = entry
    break
  }

  if (staleIds.length > 0) {
    await (admin as any).from('waitlist').delete().in('id', staleIds)
  }

  if (!next) return

  await notifyUsers(admin, [{
    user_id: next.user_id,
    type: 'waitlist_available',
    data: {
      class_id: classInfo.id,
      class_title: classInfo.title,
      spots_available: 1,
    },
  }])
}
