// Adjunta spots_taken/spots_available desde la vista class_spots a una lista de
// clases, en vez de embeber cada fila de enrollments por clase (escalabilidad,
// P2-1). class_spots ya excluye holds vencidos, así que el conteo es más preciso
// que el que hacía el cliente contando enrollments. La vista tiene SELECT para
// anon/authenticated y es security-definer, así que funciona con el cliente
// normal (incluido el feed público anónimo).
export async function attachClassSpots(
  supabase: { from: (t: string) => any },
  classes: any[]
): Promise<any[]> {
  if (!classes.length) return classes
  const ids = classes.map((c) => c.id)
  const { data } = await supabase
    .from('class_spots')
    .select('class_id, spots_taken, spots_available')
    .in('class_id', ids)
  const map = new Map<string, { spots_taken: number; spots_available: number }>(
    (data ?? []).map((r: any) => [r.class_id, { spots_taken: r.spots_taken, spots_available: r.spots_available }])
  )
  return classes.map((c) => {
    const s = map.get(c.id)
    return s ? { ...c, spots_taken: s.spots_taken, spots_available: s.spots_available } : c
  })
}
