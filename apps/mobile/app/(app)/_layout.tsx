import { useEffect, useRef } from 'react'
import { Stack } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { registerForPushNotifications, savePushToken } from '../../lib/pushNotifications'

export default function AppLayout() {
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

      // Handle tap on notification
      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
        // Navigation on tap is handled by expo-router's deep link support
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
