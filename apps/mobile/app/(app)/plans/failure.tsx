import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { XCircle } from 'lucide-react-native'

export default function PlansFailureScreen() {
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
      <View className="items-center gap-4">
        <View className="w-20 h-20 rounded-full bg-red-100 items-center justify-center">
          <XCircle size={40} stroke="#dc2626" />
        </View>

        <View className="items-center gap-2">
          <Text className="text-2xl font-bold text-gray-900">Pago no completado</Text>
          <Text className="text-sm text-gris-humo text-center mt-1">
            El pago fue cancelado o falló. Podés intentarlo nuevamente cuando quieras.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.replace('/(app)/plans' as any)}
          className="mt-4 bg-brand-600 rounded-2xl px-8 py-4 items-center"
        >
          <Text className="text-white font-bold text-base">Intentar de nuevo</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(app)/(tabs)/profile' as any)}>
          <Text className="text-gris-humo text-sm">Volver al perfil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
