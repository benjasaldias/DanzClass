import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import type { Profile } from '@danceclass/shared'

export default function ProfileScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!profile) return null

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta">
      <ScrollView className="flex-1">
        {/* Profile header */}
        <View className="bg-white px-4 py-6 items-center gap-3 border-b border-gray-100">
          <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center">
            <Text className="text-brand-700 text-2xl font-bold">{initials}</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-bold text-gray-900">{profile.full_name}</Text>
            <Text className="text-gris-humo text-sm">@{profile.username}</Text>
            <View className="mt-1 bg-brand-50 rounded-full px-3 py-1">
              <Text className="text-brand-700 text-xs font-medium">
                {profile.role === 'teacher' ? '🎤 Profesor/a' : '🎓 Estudiante'}
              </Text>
            </View>
          </View>
          {profile.bio && <Text className="text-sm text-gray-600 text-center">{profile.bio}</Text>}
        </View>

        {/* Menu */}
        <View className="bg-white mt-4 mx-4 rounded-2xl overflow-hidden border border-gray-100">
          {profile.role === 'teacher' && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/class/create' as any)}
              className="flex-row items-center gap-3 px-4 py-3.5 border-b border-gray-50"
            >
              <Text className="text-lg">💰</Text>
              <Text className="text-sm font-medium text-gray-700 flex-1">Datos bancarios</Text>
              <Text className="text-gray-300">›</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleLogout}
            className="flex-row items-center gap-3 px-4 py-3.5"
          >
            <Text className="text-lg">🚪</Text>
            <Text className="text-sm font-medium text-red-600 flex-1">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
