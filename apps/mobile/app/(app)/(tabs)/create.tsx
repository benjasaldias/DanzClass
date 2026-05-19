import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { canTeach, canPostVideo } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

export default function CreateScreen() {
  const router = useRouter()
  const [tier, setTier] = useState<SubscriptionTier | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('subscriptions')
        .select('tier')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()
      setTier((data?.tier as SubscriptionTier) ?? 'none')
    }
    load()
  }, [])

  if (tier !== null && !canTeach(tier)) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta items-center justify-center px-6" edges={['top']}>
        <Text className="text-5xl mb-4">🎓</Text>
        <Text className="text-lg font-bold text-gray-900 text-center">Necesitas un plan para publicar</Text>
        <Text className="text-sm text-gray-500 text-center mt-2 mb-6">
          Con el plan Básico puedes publicar tu primera clase
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(app)/plans' as any)}
          className="bg-brand-600 rounded-xl px-8 py-3"
        >
          <Text className="text-white font-semibold">Ver planes</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta" edges={['top']}>
      <View className="px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Publicar</Text>
        <Text className="text-sm text-gray-500 mt-0.5">¿Qué quieres publicar?</Text>
      </View>

      <View className="p-4 gap-3">
        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=suelta' as any)}
          className="bg-white border-2 border-brand-200 rounded-2xl p-5 gap-2"
        >
          <Text className="text-3xl">📅</Text>
          <Text className="text-lg font-bold text-gray-900">Clase suelta</Text>
          <Text className="text-sm text-gray-500">Una fecha específica</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=periodica' as any)}
          className="bg-white border-2 border-morado-flow/40 rounded-2xl p-5 gap-2"
        >
          <Text className="text-3xl">🔄</Text>
          <Text className="text-lg font-bold text-gray-900">Clase periódica</Text>
          <Text className="text-sm text-gray-500">Semanal, quincenal o mensual</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=entrenamiento' as any)}
          className="bg-white border-2 border-gray-200 rounded-2xl p-5 gap-2"
        >
          <Text className="text-3xl">🏋️</Text>
          <Text className="text-lg font-bold text-gray-900">Entrenamiento</Text>
          <Text className="text-sm text-gray-500">Con o sin audición</Text>
        </TouchableOpacity>

        {tier !== null && canPostVideo(tier) ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/class/create-post' as any)}
            className="bg-white border-2 border-purple-200 rounded-2xl p-5 gap-2"
          >
            <Text className="text-3xl">🎬</Text>
            <Text className="text-lg font-bold text-gray-900">Video</Text>
            <Text className="text-sm text-gray-500">Comparte una coreografía</Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-gray-50 border-2 border-gray-100 rounded-2xl p-5 gap-2 opacity-60">
            <Text className="text-3xl">🎬</Text>
            <Text className="text-lg font-bold text-gray-500">Video</Text>
            <Text className="text-sm text-gray-400">Disponible desde el plan Básico</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
