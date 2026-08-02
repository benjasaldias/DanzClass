import { Expo } from 'expo-server-sdk'
import { createAdminClient } from './supabase/admin'

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN })

export type PushPayload = {
  title: string
  body: string
  data?: Record<string, any>
}

/**
 * Sends Expo push notifications to all registered devices of the given user IDs.
 * Silently ignores invalid/expired tokens (removes them from DB).
 * Best-effort: does not throw on push failure.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return

  const admin = createAdminClient()

  // P2-2: un `.in('user_id', ids)` con un batch grande (todos los seguidores
  // de un descuento, por ejemplo) puede reventar el largo de la URL o
  // cortarse en las 1000 filas por defecto de PostgREST — en silencio,
  // porque el `catch` de más abajo se come cualquier error. Trocear en
  // tandas de usuarios evita las dos cosas: mismo patrón que `audit2.md`
  // P2-1 ya usó para este problema exacto en el cron de mensualidades.
  const USER_CHUNK_SIZE = 200
  const tokens: { token: string; user_id: string }[] = []
  for (let i = 0; i < userIds.length; i += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + USER_CHUNK_SIZE)
    const { data } = await admin
      .from('push_tokens' as any)
      .select('token, user_id')
      .in('user_id', chunk)
    if (data) tokens.push(...(data as unknown as { token: string; user_id: string }[]))
  }

  if (tokens.length === 0) return

  const messages = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      sound: 'default' as const,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }))

  if (messages.length === 0) return

  try {
    const chunks = expo.chunkPushNotifications(messages)
    const results = await Promise.allSettled(
      chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk))
    )

    // Collect invalid tokens to clean up.
    //
    // P1-6: `ExpoPushTicket` (the real SDK type, `expo-server-sdk/build/
    // ExpoClient.d.ts`) has no `to` field — that comparison was always
    // `undefined`, so `invalidTokens` stayed empty forever and no dead token
    // was ever deleted. The SDK guarantees tickets come back in the SAME
    // order and count as the messages in the chunk that produced them (per
    // its own docs: "the nth receipt is for the nth message"), so the token
    // is `chunk[ticketIndex].to` — falling back to `details.expoPushToken`
    // when the SDK does supply it.
    const invalidTokens: string[] = []
    results.forEach((result, chunkIndex) => {
      if (result.status !== 'fulfilled') return
      const chunk = chunks[chunkIndex]
      result.value.forEach((ticket, ticketIndex) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const token = ticket.details?.expoPushToken ?? chunk[ticketIndex]?.to
          if (typeof token === 'string') invalidTokens.push(token)
        }
      })
    })

    // Remove expired tokens
    if (invalidTokens.length > 0) {
      await admin.from('push_tokens' as any).delete().in('token', invalidTokens)
    }
  } catch {
    // Push failures are non-critical — in-app notifications are the source of truth
  }
}
