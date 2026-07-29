import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, AlertTriangle, Trash2 } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'
import { WEB_URL } from '@danceclass/shared'
const CONFIRM_PHRASE = 'ELIMINAR'

export default function DeleteAccountScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const canDelete = confirm === CONFIRM_PHRASE

  async function handleDelete() {
    if (!canDelete) return

    Alert.alert(
      'Última confirmación',
      'Esta acción es irreversible. ¿Eliminar tu cuenta definitivamente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) {
              Alert.alert('Error', 'No se pudo autenticar. Inicia sesión de nuevo.')
              setLoading(false)
              return
            }

            const res = await fetch(`${WEB_URL}/api/account/delete`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            })

            if (res.ok) {
              await supabase.auth.signOut()
              router.replace('/(auth)/login' as any)
            } else {
              const json = await res.json().catch(() => ({}))
              Alert.alert('Error', json.error ?? 'No se pudo eliminar la cuenta. Intenta de nuevo.')
              setLoading(false)
            }
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1 mb-6">
          <ChevronLeft stroke={isDark ? '#EEEDFE' : '#6B6880'} size={20} />
          <Text className="text-sm text-gris-humo dark:text-dark-text2">Volver</Text>
        </TouchableOpacity>

        <View className="bg-white dark:bg-dark-surface rounded-2xl p-5 gap-5">
          {/* Title */}
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 items-center justify-center">
              <Trash2 stroke="#dc2626" size={24} />
            </View>
            <View>
              <Text className="text-base font-bold text-gray-900 dark:text-dark-text">Eliminar cuenta</Text>
              <Text className="text-sm text-gray-500 dark:text-dark-text2">Esta acción no se puede deshacer</Text>
            </View>
          </View>

          {/* Warning */}
          <View className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <AlertTriangle stroke="#dc2626" size={16} />
              <Text className="text-sm font-semibold text-red-700 dark:text-red-400">Al eliminar tu cuenta:</Text>
            </View>
            {[
              'Perderás acceso permanente a tu perfil e inscripciones',
              'Tus clases publicadas serán canceladas',
              'Tu suscripción activa será cancelada',
              'Los pagos confirmados se mantienen por auditoría legal',
              'Tu nombre en publicaciones quedará como "Usuario eliminado"',
            ].map((line, i) => (
              <Text key={i} className="text-sm text-red-600 dark:text-red-400 pl-4">• {line}</Text>
            ))}
          </View>

          {/* Confirmation input */}
          <View className="gap-2">
            <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
              Para confirmar, escribe{' '}
              <Text className="font-bold text-red-600 dark:text-red-400">{CONFIRM_PHRASE}</Text>
            </Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={CONFIRM_PHRASE}
              autoCapitalize="characters"
              className="border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Delete button */}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={!canDelete || loading}
            className={`w-full rounded-xl bg-red-600 py-4 items-center flex-row justify-center gap-2 ${(!canDelete || loading) ? 'opacity-40' : ''}`}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Trash2 stroke="white" size={18} />
            }
            <Text className="text-white font-semibold text-sm">Eliminar mi cuenta definitivamente</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
