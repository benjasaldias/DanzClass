import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '../../lib/supabase'
import type { UserRole } from '@danceclass/shared'

export default function RegisterScreen() {
  const [role, setRole] = useState<UserRole>('student')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister() {
    if (!fullName || !username || !email || !password) {
      setError('Completa todos los campos obligatorios')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, username: username.toLowerCase(), role, city: city || null },
      },
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-purple-950">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="flex-1 px-6">
        <View className="flex-1 justify-center py-12 gap-8">
          <View className="items-center gap-3">
            <View className="w-16 h-16 bg-white/10 rounded-2xl items-center justify-center">
              <Text className="text-3xl">💃</Text>
            </View>
            <Text className="text-white text-3xl font-bold">DanceClass</Text>
          </View>

          <View className="bg-white rounded-3xl p-6 gap-4">
            <View>
              <Text className="text-2xl font-bold text-gray-900">Crear cuenta</Text>
              <Text className="text-gray-500 text-sm mt-1">Únete a la comunidad</Text>
            </View>

            {/* Role */}
            <View className="flex-row gap-3">
              {(['student', 'teacher'] as UserRole[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  className={`flex-1 rounded-xl border-2 p-3 items-center gap-1 ${role === r ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
                >
                  <Text className="text-2xl">{r === 'student' ? '🎓' : '🎤'}</Text>
                  <Text className={`text-sm font-semibold ${role === r ? 'text-brand-700' : 'text-gray-700'}`}>
                    {r === 'student' ? 'Estudiante' : 'Profesor/a'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Text className="text-red-700 text-sm">{error}</Text>
              </View>
            )}

            <View className="gap-3">
              {[
                { label: 'Nombre completo *', value: fullName, onChange: setFullName, placeholder: 'Tu nombre' },
                { label: 'Usuario *', value: username, onChange: setUsername, placeholder: 'tuusuario', autoCapitalize: 'none' as const },
                { label: 'Email *', value: email, onChange: setEmail, placeholder: 'tu@email.com', keyboardType: 'email-address' as const, autoCapitalize: 'none' as const },
                { label: 'Ciudad', value: city, onChange: setCity, placeholder: 'Santiago, Valparaíso...' },
                { label: 'Contraseña *', value: password, onChange: setPassword, placeholder: 'Mínimo 6 caracteres', secureTextEntry: true },
              ].map(({ label, value, onChange, placeholder, ...props }) => (
                <View key={label}>
                  <Text className="text-sm font-medium text-gray-700 mb-1.5">{label}</Text>
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                    {...props}
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              className="bg-brand-600 rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold text-base">
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row justify-center gap-1">
              <Text className="text-gray-500 text-sm">¿Ya tienes cuenta?</Text>
              <Link href="/(auth)/login">
                <Text className="text-brand-600 font-semibold text-sm">Inicia sesión</Text>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
