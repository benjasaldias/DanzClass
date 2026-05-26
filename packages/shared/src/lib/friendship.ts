// D-12 — Helpers para amistad bidireccional.
// `friendships` se almacena con (requester_id, addressee_id). Toda consulta
// "¿soy amigo de X?" debe considerar ambas direcciones; omitir el OR genera
// falsos negativos.
//
// Estos helpers aceptan cualquier cliente Supabase (server, client o admin).

export type AnyClient = { from: (table: string) => any }

/** Devuelve true si userA y userB son amigos (status='accepted'). */
export async function isFriendOf(supabase: AnyClient, userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userA},addressee_id.eq.${userA}`)
    .or(`requester_id.eq.${userB},addressee_id.eq.${userB}`)
    .maybeSingle()
  return !!data
}

/** Devuelve los IDs de los amigos aceptados del usuario. */
export async function getFriendIds(supabase: AnyClient, userId: string): Promise<string[]> {
  if (!userId) return []
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  return (data ?? []).map((f: any) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  )
}
