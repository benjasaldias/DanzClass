import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../components/ui/Icon'
import LogoIcon from '../../components/ui/LogoIcon'

const WEB_URL = 'https://dc-project-web.vercel.app'
const RESEND_COOLDOWN = 60

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type FormData = z.infer<typeof schema>

export default function LoginScreen() {
  const router = useRouter()
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function onSubmit(data: FormData) {
    setUnconfirmedEmail(null)
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password })
    if (error) {
      const notConfirmed =
        (error as any).code === 'email_not_confirmed' ||
        /not confirmed|no confirmad/i.test(error.message)
      if (notConfirmed) {
        setUnconfirmedEmail(data.email)
        setError('root', { message: 'Debes confirmar tu correo antes de iniciar sesión.' })
      } else {
        setError('root', { message: 'Email o contraseña incorrectos' })
      }
    } else {
      router.replace('/(app)/(tabs)/feed')
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0 || !unconfirmedEmail) return
    setResending(true)
    try {
      await fetch(`${WEB_URL}/api/auth/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unconfirmedEmail }),
      })
    } catch {
      // silencioso
    } finally {
      setResending(false)
      setCooldown(RESEND_COOLDOWN)
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
              <LogoIcon size={32} color="white" />
            </View>
            <Text className="text-white text-3xl font-bold">DanzClass</Text>
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
                {unconfirmedEmail && (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resending || cooldown > 0}
                    className="mt-2"
                  >
                    <Text className={`text-sm font-semibold ${resending || cooldown > 0 ? 'text-gray-400' : 'text-brand-600'}`}>
                      {cooldown > 0
                        ? `Reenviar en ${cooldown}s`
                        : resending
                        ? 'Enviando...'
                        : 'Reenviar correo de verificación'}
                    </Text>
                  </TouchableOpacity>
                )}
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
