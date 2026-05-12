import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function CreateScreen() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? null)
    }
    load()
  }, [])

  if (role !== 'teacher') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-4xl mb-4">🎓</Text>
        <Text className="text-lg font-bold text-gray-900 text-center">Solo profesores pueden publicar clases</Text>
        <Text className="text-sm text-gray-500 text-center mt-2">Explora el feed para encontrar clases disponibles</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 py-4 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Publicar clase</Text>
        <Text className="text-sm text-gray-500 mt-0.5">¿Qué tipo de clase quieres publicar?</Text>
      </View>

      <View className="p-4 gap-3">
        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=suelta' as any)}
          className="bg-white border-2 border-brand-200 rounded-2xl p-5 gap-2"
        >
          <Text className="text-3xl">📅</Text>
          <Text className="text-lg font-bold text-gray-900">Clase suelta</Text>
          <Text className="text-sm text-gray-500">Una fecha específica, sin periodicidad</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=periodica' as any)}
          className="bg-white border-2 border-purple-200 rounded-2xl p-5 gap-2"
        >
          <Text className="text-3xl">🔄</Text>
          <Text className="text-lg font-bold text-gray-900">Clase periódica</Text>
          <Text className="text-sm text-gray-500">Se repite semanalmente, quincenal o mensual</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
