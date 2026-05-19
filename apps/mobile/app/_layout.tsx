import { useEffect, useState } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import '../global.css'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Refresh token invalid/expired — clear stored tokens and force re-login
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
    if (session === undefined) return // still loading

    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && !inAppGroup) {
      router.replace('/(app)/(tabs)/feed')
    }
  }, [session, segments])

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Slot />
    </SafeAreaProvider>
  )
}
