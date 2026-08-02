import type { createAdminClient } from './supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Quién puede entrar a una clase — fuente única (audit3 P0-2).
//
// Estas validaciones vivían escritas a mano dentro de `/api/class/enroll`, y
// `/api/class-2x/match` —que también crea inscripciones, dos de una vez— no
// repetía ninguna: bastaba con crear una solicitud 2x (la policy de INSERT sólo
// exige `user_id = auth.uid()`, así que un POST directo a PostgREST basta) y
// pedirle a un conocido que la matcheara para entrar a un entrenamiento con
// audición obligatoria, a una clase vencida o a una clase cancelada.
//
// Toda ruta nueva que inserte en `enrollments` en nombre de un alumno tiene que
// pasar por acá. Los códigos de error y los status son los mismos que ya
// devolvía `enroll`, para que el cliente no tenga que aprender un vocabulario
// nuevo por ruta.

/** Columnas que necesitan los guards. Se selecciona una vez y se reusa. */
export const ENROLLABLE_CLASS_FIELDS =
  'id, teacher_id, title, status, price, price_2x, price_suelta_2x, discount_price, type, date, ' +
  'ends_at, ends_indefinitely, requires_audition, audition_closed, allow_late_payment, ' +
  'accepts_mp, accepts_transfer'

export type EnrollableClass = {
  id: string
  teacher_id: string
  title: string | null
  status: string
  type: string
  date: string | null
  ends_at: string | null
  ends_indefinitely: boolean | null
  requires_audition: boolean | null
  price: number | null
  price_2x?: number | null
  price_suelta_2x?: number | null
  discount_price?: number | null
  allow_late_payment: boolean | null
  accepts_mp: boolean | null
  accepts_transfer: boolean | null
  [key: string]: any
}

export type EnrollBlock = { error: string; status: number }

/**
 * Carga la clase para inscribir, o `null` si no existe o no está activa.
 * (Una clase cancelada nunca admite inscripciones nuevas.)
 */
export async function loadEnrollableClass(
  admin: AdminClient,
  classId: string
): Promise<EnrollableClass | null> {
  const { data } = await (admin as any)
    .from('classes')
    .select(ENROLLABLE_CLASS_FIELDS)
    .eq('id', classId)
    .eq('status', 'active')
    .maybeSingle()
  return (data as EnrollableClass) ?? null
}

/**
 * ¿Puede este usuario quedar inscrito en esta clase? Devuelve el bloqueo o
 * `null` si no hay ninguno. NO mira cupos ni inscripciones previas: eso depende
 * de cuántas filas va a crear el llamador (una en `enroll`, dos en un 2x) y lo
 * resuelve cada ruta con la vista `class_spots` y el trigger de capacidad (056).
 *
 * El orden se conserva a propósito: vencida → audición → dueño → vía de pago.
 */
export async function assertCanEnroll(
  admin: AdminClient,
  cls: EnrollableClass,
  userId: string
): Promise<EnrollBlock | null> {
  const today = new Date().toISOString().split('T')[0]
  if (cls.type === 'suelta') {
    if (cls.date && cls.date < today) return { error: 'class_expired', status: 400 }
  } else if (!cls.ends_indefinitely && cls.ends_at && cls.ends_at < today) {
    return { error: 'class_expired', status: 400 }
  }

  // Entrenamiento con audición: sólo entra quien el profesor aceptó. Es la
  // selección que define la clase, no un trámite.
  if (cls.requires_audition) {
    const { data: audition } = await (admin as any)
      .from('auditions')
      .select('status')
      .eq('class_id', cls.id)
      .eq('applicant_id', userId)
      .maybeSingle()
    if (!audition || audition.status !== 'accepted') {
      return { error: 'audition_required', status: 403 }
    }
  }

  if (cls.teacher_id === userId) {
    return { error: 'No puedes inscribirte en tu propia clase', status: 403 }
  }

  // La clase tiene que ofrecer alguna vía de pago viable. El CHECK de la
  // migración 061 garantiza al menos un flag marcado, pero `accepts_mp` no basta
  // si el profesor nunca conectó su cuenta de Mercado Pago: reservar ahí deja al
  // alumno con un cupo que no puede pagar. `!== false` cubre las clases
  // anteriores a la migración.
  if (cls.accepts_transfer === false) {
    const { data: teacherProfile } = await (admin as any)
      .from('profiles')
      .select('mp_connected')
      .eq('id', cls.teacher_id)
      .maybeSingle()
    if (cls.accepts_mp === false || !teacherProfile?.mp_connected) {
      return { error: 'no_payment_method', status: 400 }
    }
  }

  return null
}
