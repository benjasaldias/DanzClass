import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-purple-950">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="flex-1 px-6">
        <View className="flex-1 justify-center py-12 gap-8">
          {/* Logo */}
          <View className="items-center gap-3">
            <View className="w-16 h-16 bg-white/10 rounded-2xl items-center justify-center">
              <Text className="text-3xl">💃</Text>
            </View>
            <Text className="text-white text-3xl font-bold">DanceClass</Text>
          </View>

          {/* Form card */}
          <View className="bg-white rounded-3xl p-6 gap-4">
            <View>
              <Text className="text-2xl font-bold text-gray-900">Bienvenido</Text>
              <Text className="text-gray-500 text-sm mt-1">Ingresa a tu cuenta</Text>
            </View>

            {error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Text className="text-red-700 text-sm">{error}</Text>
              </View>
            )}

            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tu@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Contraseña</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className="bg-brand-600 rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold text-base">
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row justify-center gap-1">
              <Text className="text-gray-500 text-sm">¿No tienes cuenta?</Text>
              <Link href="/(auth)/register">
                <Text className="text-brand-600 font-semibold text-sm">Regístrate</Text>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
