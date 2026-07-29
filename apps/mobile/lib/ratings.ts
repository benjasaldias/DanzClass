import { supabase } from './supabase'
import { WEB_URL } from '@danceclass/shared'

type UpsertResult = { ok: true; avgRating: number; ratingCount: number } | { ok: false; error: string }

/**
 * Registra/actualiza una valoración vía /api/ratings/upsert (Bearer token).
 *
 * Mobile escribía antes directo en `ratings`, saltándose la verificación de
 * elegibilidad (inscripción confirmada + clase ya ocurrida) que solo existe en
 * esa ruta. Desde la migración 065 la tabla no acepta escrituras del cliente:
 * la ruta es el único camino, para web y mobile.
 */
export async function upsertRating(ratedUserId: string, stars: number): Promise<UpsertResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' }

  try {
    const res = await fetch(`${WEB_URL}/api/ratings/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rated_user_id: ratedUserId, stars }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 403
          ? 'Solo puedes valorar a profesores con los que ya tomaste una clase.'
          : (body?.error ?? 'No se pudo guardar la valoración.'),
      }
    }
    return { ok: true, avgRating: body.avgRating ?? 0, ratingCount: body.ratingCount ?? 0 }
  } catch {
    return { ok: false, error: 'Sin conexión. Intenta de nuevo.' }
  }
}
