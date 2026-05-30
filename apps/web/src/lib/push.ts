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
  const { data: tokens } = await admin
    .from('push_tokens' as any)
    .select('token, user_id')
    .in('user_id', userIds)

  if (!tokens || tokens.length === 0) return

  const messages = (tokens as unknown as { token: string; user_id: string }[])
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

    // Collect invalid tokens to clean up
    const invalidTokens: string[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const ticket of result.value) {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            // Find the token for this ticket (by matching to and position)
            const matchingMsg = messages.find((m) => m.to === (ticket as any).to)
            if (matchingMsg) invalidTokens.push(matchingMsg.to)
          }
        }
      }
    }

    // Remove expired tokens
    if (invalidTokens.length > 0) {
      await admin.from('push_tokens' as any).delete().in('token', invalidTokens)
    }
  } catch {
    // Push failures are non-critical — in-app notifications are the source of truth
  }
}
