import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { canTeach, canPostVideo, getActiveTier } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'
import { GraduationCap, CalendarDays, Repeat, Dumbbell, Film } from 'lucide-react-native'
import { Icon } from '../../../components/ui/Icon'

export default function CreateScreen() {
  const router = useRouter()
  const [tier, setTier] = useState<SubscriptionTier | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setTier(await getActiveTier(user.id, supabase))
    }
    load()
  }, [])

  if (tier !== null && !canTeach(tier)) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg items-center justify-center px-6" edges={['top']}>
        <View className="mb-4">
          <Icon icon={GraduationCap} size={32} />
        </View>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text text-center">Necesitas un plan para publicar</Text>
        <Text className="text-sm text-gray-500 dark:text-dark-text2 text-center mt-2 mb-6">
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
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="px-4 py-4 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">Publicar</Text>
        <Text className="text-sm text-gray-500 dark:text-dark-text2 mt-0.5">¿Qué quieres publicar?</Text>
      </View>

      <View className="p-4 gap-3">
        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=suelta' as any)}
          className="bg-white dark:bg-dark-surface border-2 border-brand-200 dark:border-brand-900/60 rounded-2xl p-5 gap-2"
        >
          <Icon icon={CalendarDays} size={28} variant="active" />
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Clase suelta</Text>
          <Text className="text-sm text-gray-500 dark:text-dark-text2">Una fecha específica</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=periodica' as any)}
          className="bg-white dark:bg-dark-surface border-2 border-morado-flow/40 rounded-2xl p-5 gap-2"
        >
          <Icon icon={Repeat} size={28} stroke="#7F77DD" />
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Clase periódica</Text>
          <Text className="text-sm text-gray-500 dark:text-dark-text2">Semanal, quincenal o mensual</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(app)/class/create?type=entrenamiento' as any)}
          className="bg-white dark:bg-dark-surface border-2 border-gray-200 dark:border-dark-border rounded-2xl p-5 gap-2"
        >
          <Icon icon={Dumbbell} size={28} />
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Entrenamiento</Text>
          <Text className="text-sm text-gray-500 dark:text-dark-text2">Con o sin audición</Text>
        </TouchableOpacity>

        {tier !== null && canPostVideo(tier) ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/class/create-post' as any)}
            className="bg-white dark:bg-dark-surface border-2 border-purple-200 dark:border-purple-900/40 rounded-2xl p-5 gap-2"
          >
            <Icon icon={Film} size={28} variant="active" />
            <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Video</Text>
            <Text className="text-sm text-gray-500 dark:text-dark-text2">Comparte una coreografía</Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-gray-50 dark:bg-dark-surface2 border-2 border-gray-100 dark:border-dark-border rounded-2xl p-5 gap-2 opacity-60">
            <Icon icon={Film} size={28} />
            <Text className="text-lg font-bold text-gray-500 dark:text-dark-text2">Video</Text>
            <Text className="text-sm text-gray-400 dark:text-dark-text2/60">Disponible desde el plan Básico</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
