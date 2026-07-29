import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CheckCircle2 } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getActiveTier } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

const TIER_LABELS: Record<string, string> = {
  basic: 'Plan Básico',
  pro: 'Plan Pro',
  teacher: 'Plan Profesor',
}

export default function PlansSuccessScreen() {
  const router = useRouter()
  const [tier, setTier] = useState<SubscriptionTier | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      setTier(await getActiveTier(user.id, supabase))
      setLoading(false)
    }
    load()
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
      {loading ? (
        <ActivityIndicator color="#c026d3" />
      ) : (
        <View className="items-center gap-4">
          <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center">
            <CheckCircle2 size={40} stroke="#16a34a" />
          </View>

          <View className="items-center gap-2">
            <Text className="text-2xl font-bold text-gray-900">¡Pago exitoso!</Text>
            {tier && tier !== 'none' && (
              <Text className="text-brand-600 font-semibold text-base">
                {TIER_LABELS[tier] ?? tier} activado
              </Text>
            )}
            <Text className="text-sm text-gris-humo text-center mt-1">
              Ya puedes acceder a todas las funciones de tu plan.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/(app)/(tabs)/profile' as any)}
            className="mt-4 bg-brand-600 rounded-2xl px-8 py-4 items-center"
          >
            <Text className="text-white font-bold text-base">Ver mi perfil</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(app)/(tabs)/feed' as any)}>
            <Text className="text-gris-humo text-sm">Ir al feed</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}
