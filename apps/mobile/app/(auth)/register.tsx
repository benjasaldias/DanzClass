import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { Music2 } from 'lucide-react-native'
import { Icon } from '../../components/ui/Icon'

const schema = z.object({
  fullName: z.string().min(2, 'Mínimo 2 caracteres'),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo letras minúsculas, números y _'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  city: z.string().optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los términos de uso' }) }),
})

type FormData = z.infer<typeof schema>

export default function RegisterScreen() {
  const router = useRouter()
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', username: '', email: '', password: '', city: '', terms: undefined as any },
  })

  async function onSubmit(data: FormData) {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          username: data.username.toLowerCase(),
          city: data.city || null,
        },
      },
    })
    if (error) {
      setError('root', { message: error.message })
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
              <Icon icon={Music2} size={28} variant="active" />
            </View>
            <Text className="text-white text-3xl font-bold">DanzClass</Text>
          </View>

          {/* Form */}
          <View className="bg-white rounded-3xl p-6 gap-4">
            <View>
              <Text className="text-2xl font-bold text-gray-900">Crear cuenta</Text>
              <Text className="text-gray-500 text-sm mt-1">Únete a la comunidad</Text>
            </View>

            {errors.root && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Text className="text-red-700 text-sm">{errors.root.message}</Text>
              </View>
            )}

            {/* Nombre */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Nombre completo *</Text>
              <Controller
                control={control}
                name="fullName"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="Tu nombre"
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
              {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
            </View>

            {/* Usuario */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Nombre de usuario *</Text>
              <Controller
                control={control}
                name="username"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={(t: string) => onChange(t.toLowerCase())}
                    placeholder="tuusuario"
                    autoCapitalize="none"
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
              {errors.username && <Text className="text-red-500 text-xs mt-1">{errors.username.message}</Text>}
            </View>

            {/* Email */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Email *</Text>
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

            {/* Ciudad */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Ciudad</Text>
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="Santiago, Valparaíso..."
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
            </View>

            {/* Contraseña */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Contraseña *</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="Mínimo 6 caracteres"
                    secureTextEntry
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  />
                )}
              />
              {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}
            </View>

            {/* Términos */}
            <Controller
              control={control}
              name="terms"
              render={({ field: { onChange, value } }) => (
                <TouchableOpacity
                  onPress={() => onChange(value ? undefined : true)}
                  className="flex-row items-start gap-3"
                  activeOpacity={0.7}
                >
                  <View
                    className={`w-5 h-5 rounded border-2 mt-0.5 items-center justify-center flex-shrink-0 ${
                      value ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                    }`}
                  >
                    {value && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text className="text-sm text-gray-600 flex-1">
                    Acepto los{' '}
                    <Text className="text-brand-600 font-medium">Términos de Uso</Text>
                    {' '}de DanzClass *
                  </Text>
                </TouchableOpacity>
              )}
            />
            {errors.terms && <Text className="text-red-500 text-xs -mt-2">{errors.terms.message}</Text>}

            <TouchableOpacity
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              className={`rounded-xl py-3 items-center ${isSubmitting ? 'bg-gray-300' : 'bg-brand-600'}`}
            >
              <Text className="text-white font-semibold text-base">
                {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
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
