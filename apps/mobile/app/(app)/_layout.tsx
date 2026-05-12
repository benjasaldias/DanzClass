import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="class/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="teacher/[username]" options={{ presentation: 'card' }} />
      <Stack.Screen name="payment/[enrollmentId]" options={{ presentation: 'modal' }} />
    </Stack>
  )
}
