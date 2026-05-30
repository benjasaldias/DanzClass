import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configure how notifications are displayed while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      return null
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'DanzClass',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#c026d3',
      })
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '4cf46d7a-bcac-4fff-ae1f-4f032b520c99', // from app.json extra.eas.projectId
    })
    return tokenData.data
  } catch {
    // Fails silently on simulators and when push is not supported
    return null
  }
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  await (supabase as any)
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS as 'ios' | 'android' | 'web',
      },
      { onConflict: 'user_id,token' }
    )
}

export async function deletePushToken(userId: string, token: string): Promise<void> {
  await (supabase as any)
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token)
}
