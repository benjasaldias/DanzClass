/**
 * Descartes de horario en un ensayo — la escritura, compartida por web y mobile.
 *
 * Los descartes SÍ los escribe el cliente (RLS los cubre entera: es mi marca y
 * soy parte del ensayo; ver 077), así que no hay ruta de servidor. Pero la
 * lógica del toggle no es un solo INSERT —descartar el día completo tiene que
 * limpiar las horas sueltas de ese día— y duplicarla en dos plataformas es cómo
 * se desincronizan. Vive acá una sola vez.
 *
 * `supabase` es el cliente con sesión del usuario (web o mobile), no el admin:
 * la policy es la que valida, no este código.
 */

export type DiscardRow = {
  id?: string
  user_id: string
  discard_date: string
  hour: number | null
}

type MinimalClient = {
  from: (table: string) => any
}

/** Índice consultable a partir de las filas crudas que devuelve la ruta. */
export type DiscardIndex = {
  /** ¿este usuario descartó el día completo? */
  hasDay: (userId: string, date: string) => boolean
  /** ¿esta hora está descartada (por el día completo o puntualmente)? */
  hasHour: (userId: string, date: string, hour: number) => boolean
  /** usuarios que descartaron esa hora (incluye los que descartaron el día). */
  usersAtHour: (date: string, hour: number) => string[]
  /** usuarios que descartaron el día completo. */
  usersAtDay: (date: string) => string[]
}

export function buildDiscardIndex(rows: DiscardRow[]): DiscardIndex {
  const days = new Map<string, Set<string>>() // date → userIds (día completo)
  const hours = new Map<string, Set<string>>() // `${date}:${hour}` → userIds

  for (const r of rows) {
    if (r.hour === null || r.hour === undefined) {
      if (!days.has(r.discard_date)) days.set(r.discard_date, new Set())
      days.get(r.discard_date)!.add(r.user_id)
    } else {
      const key = `${r.discard_date}:${r.hour}`
      if (!hours.has(key)) hours.set(key, new Set())
      hours.get(key)!.add(r.user_id)
    }
  }

  const hasDay = (userId: string, date: string) => days.get(date)?.has(userId) ?? false

  return {
    hasDay,
    hasHour: (userId, date, hour) =>
      hasDay(userId, date) || (hours.get(`${date}:${hour}`)?.has(userId) ?? false),
    usersAtHour: (date, hour) => {
      const out = new Set<string>(days.get(date) ?? [])
      for (const u of hours.get(`${date}:${hour}`) ?? []) out.add(u)
      return [...out]
    },
    usersAtDay: (date) => [...(days.get(date) ?? [])],
  }
}

/**
 * Descarta o recupera el DÍA COMPLETO.
 *
 * Al descartar borra también las horas sueltas de ese día: dejarlas sería
 * guardar dos veces la misma información y, al recuperar el día, reaparecerían
 * horas descartadas que el usuario ya no recuerda haber marcado.
 */
export async function toggleDayDiscard(
  supabase: MinimalClient,
  rehearsalId: string,
  userId: string,
  date: string,
  discard: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (discard) {
    const { error: delErr } = await supabase
      .from('rehearsal_discards')
      .delete()
      .eq('rehearsal_id', rehearsalId)
      .eq('user_id', userId)
      .eq('discard_date', date)
      .not('hour', 'is', null)
    if (delErr) return { ok: false, error: delErr.message }

    const { error } = await supabase
      .from('rehearsal_discards')
      .insert({ rehearsal_id: rehearsalId, user_id: userId, discard_date: date, hour: null })
    // 23505 = ya estaba descartado. El resultado deseado ya se cumple.
    if (error && error.code !== '23505') return { ok: false, error: error.message }
    return { ok: true }
  }

  const { error } = await supabase
    .from('rehearsal_discards')
    .delete()
    .eq('rehearsal_id', rehearsalId)
    .eq('user_id', userId)
    .eq('discard_date', date)
    .is('hour', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Descarta o recupera UNA HORA.
 *
 * Recuperar una hora dentro de un día descartado por completo convierte el
 * descarte de día en descartes de las otras 23 horas: es la única lectura
 * coherente de "puedo a las 15:00 pero el resto del día no", y evita el estado
 * contradictorio de un día marcado entero con un agujero.
 */
export async function toggleHourDiscard(
  supabase: MinimalClient,
  rehearsalId: string,
  userId: string,
  date: string,
  hour: number,
  discard: boolean,
  dayIsDiscarded: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (discard) {
    if (dayIsDiscarded) return { ok: true } // ya está cubierto por el día
    const { error } = await supabase
      .from('rehearsal_discards')
      .insert({ rehearsal_id: rehearsalId, user_id: userId, discard_date: date, hour })
    if (error && error.code !== '23505') return { ok: false, error: error.message }
    return { ok: true }
  }

  if (dayIsDiscarded) {
    const others = Array.from({ length: 24 }, (_, h) => h).filter((h) => h !== hour)
    const { error: insErr } = await supabase
      .from('rehearsal_discards')
      .insert(others.map((h) => ({
        rehearsal_id: rehearsalId, user_id: userId, discard_date: date, hour: h,
      })))
    if (insErr && insErr.code !== '23505') return { ok: false, error: insErr.message }

    const { error: delErr } = await supabase
      .from('rehearsal_discards')
      .delete()
      .eq('rehearsal_id', rehearsalId)
      .eq('user_id', userId)
      .eq('discard_date', date)
      .is('hour', null)
    if (delErr) return { ok: false, error: delErr.message }
    return { ok: true }
  }

  const { error } = await supabase
    .from('rehearsal_discards')
    .delete()
    .eq('rehearsal_id', rehearsalId)
    .eq('user_id', userId)
    .eq('discard_date', date)
    .eq('hour', hour)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
