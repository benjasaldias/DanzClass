import { useEffect, useState } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { ThemeProvider, useTheme } from '../context/ThemeContext'
import '../global.css'

function AppContent() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()
  const { isDark } = useTheme()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        supabase.auth.signOut().finally(() => setSession(null))
      } else {
        setSession(session)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return

    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && !inAppGroup) {
      router.replace('/(app)/(tabs)/feed')
    }
  }, [session, segments])

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Slot />
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Sora-Bold': require('../assets/fonts/Sora-Bold.ttf'),
  })

  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
