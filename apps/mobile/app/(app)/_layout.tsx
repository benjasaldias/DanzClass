import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/index" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/[id]/edit" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/create" options={{ presentation: 'card' }} />
      <Stack.Screen name="class/create-post" options={{ presentation: 'card' }} />
      <Stack.Screen name="profile/edit" options={{ presentation: 'card' }} />
      <Stack.Screen name="profile/payment-info" options={{ presentation: 'card' }} />
      <Stack.Screen name="teacher/[username]" options={{ presentation: 'card' }} />
      <Stack.Screen name="payment/[enrollmentId]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plans/index" options={{ presentation: 'card' }} />
      <Stack.Screen name="plans/success" options={{ presentation: 'card' }} />
      <Stack.Screen name="plans/failure" options={{ presentation: 'card' }} />
    </Stack>
  )
}
