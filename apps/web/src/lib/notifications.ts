type NotifPayload = { user_id: string; type: string; data: Record<string, any> }

/**
 * Envía notificaciones a otros usuarios mediante /api/notifications/send.
 * El servidor valida el tipo y la relación entre el sender y el contenido referenciado.
 * Las cookies del navegador acompañan la request — no se requiere Bearer token.
 */
export async function sendNotifications(payload: NotifPayload | NotifPayload[]): Promise<void> {
  const notifications = Array.isArray(payload) ? payload : [payload]
  if (notifications.length === 0) return
  await fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notifications }),
  })
}
