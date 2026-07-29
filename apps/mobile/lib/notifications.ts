import { supabase } from './supabase'
import { WEB_URL } from '@danceclass/shared'

type NotifPayload = { user_id: string; type: string; data: Record<string, any> }

/**
 * Envía notificaciones a otros usuarios mediante /api/notifications/send (Bearer token).
 * El servidor valida que el sender esté autorizado por tipo (follow self, teacher de la clase, etc.).
 */
export async function sendNotifications(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const notifications = Array.isArray(payload) ? payload : [payload]
  if (notifications.length === 0) return

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return

  await fetch(`${WEB_URL}/api/notifications/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notifications }),
  })
}
