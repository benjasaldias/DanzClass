import { useEffect, useRef } from 'react'
import { Stack, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { registerForPushNotifications, savePushToken } from '../../lib/pushNotifications'
import { resolveNotificationRoute } from '../../lib/notificationRoutes'

export default function AppLayout() {
  const router = useRouter()
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    async function setupPush() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const token = await registerForPushNotifications()
      if (token) await savePushToken(user.id, token)

      // Listen for incoming notifications while app is open (foreground)
      notificationListener.current = Notifications.addNotificationReceivedListener(() => {
        // Notification handled by handler set in pushNotifications.ts
      })

      // Handle tap on notification (audit3 P1-6). `sendPushToUsers` sends
      // `data: { type, ...rowData }` (lib/notifyUsers.ts) — never a `url`
      // field, so expo-router's deep-link auto-navigation (the previous
      // assumption here) never had anything to follow. Same route table as
      // the in-app notification list, so the two never drift apart.
      responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const raw = (response.notification.request.content.data ?? {}) as Record<string, any>
        const { type, ...data } = raw
        if (!type) return
        const route = await resolveNotificationRoute(String(type), data, supabase)
        if (route) router.push(route as any)
      })
    }

    setupPush()

    return () => {
      notificationListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/index" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/edit" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/auditions" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/scan-attendance" options={{ presentation: 'card', headerShown: false }} />
      <Stack.Screen name="class/create" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/create-post" options={{ presentation: 'card' }} />
      <Stack.Screen name="profile/edit" options={{ presentation: 'card' }} />
      <Stack.Screen name="profile/payment-info" options={{ presentation: 'card' }} />
      <Stack.Screen name="teacher/[username]" options={{ presentation: 'card' }} />
      <Stack.Screen name="payment/[enrollmentId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="payment/review/[paymentId]" options={{ presentation: 'card' }} />
      <Stack.Screen name="plans/index" options={{ presentation: 'card' }} />
      <Stack.Screen name="plans/success" options={{ presentation: 'card' }} />
      <Stack.Screen name="plans/failure" options={{ presentation: 'card' }} />
      <Stack.Screen name="event/create" options={{ presentation: 'card' }} />
      <Stack.Screen name="event/[id]/index" options={{ presentation: 'card' }} />
    </Stack>
  )
}
