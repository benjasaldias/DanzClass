import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type FormData = z.infer<typeof schema>

export default function LoginScreen() {
  const router = useRouter()
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(data: FormData) {
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password })
    if (error) {
      setError('root', { message: 'Email o contraseña incorrectos' })
    } else {
      router.replace('/(app)/(tabs)/feed')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-noche-urbana"
    >
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

            {errors.root && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Text className="text-red-700 text-sm">{errors.root.message}</Text>
              </View>
            )}

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="tu@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
              {errors.email && <Text className="text-red-500 text-xs mt-1">{errors.email.message}</Text>}
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Contraseña</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="••••••••"
                    secureTextEntry
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
              {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}
            </View>

            <TouchableOpacity
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              className={`rounded-xl py-3 items-center ${isSubmitting ? 'bg-gray-300' : 'bg-brand-600'}`}
            >
              <Text className="text-white font-semibold text-base">
                {isSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
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
