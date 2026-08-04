import { supabase } from './supabase'
import { WEB_URL } from '@danceclass/shared'

type TeachRequestResult =
  | { ok: true; requested: boolean; count: number }
  | { ok: false; error: string }

/**
 * "¡Enséñala!" desde mobile. Igual que web, pasa por /api/post/teach-request
 * (Bearer): la tabla `post_teach_requests` no acepta escrituras del cliente
 * porque hay reglas que la RLS no puede expresar — que el autor lo haya
 * habilitado, que no sea el propio autor, y que el aviso salga una sola vez.
 * Ver 076_post_interactions.sql.
 */
export async function setTeachRequest(postId: string, requested: boolean): Promise<TeachRequestResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' }

  try {
    const res = await fetch(`${WEB_URL}/api/post/teach-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ postId, action: requested ? 'add' : 'remove' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error === 'teach_requests_disabled'
          ? 'El autor ya no acepta pedidos para este video.'
          : 'No se pudo enviar tu pedido. Intenta de nuevo.',
      }
    }
    return { ok: true, requested: !!body.requested, count: Number(body.count ?? 0) }
  } catch {
    return { ok: false, error: 'Sin conexión. Intenta de nuevo.' }
  }
}
