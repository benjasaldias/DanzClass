import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { CheckCircle2, CreditCard, Wallet } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { formatCLP } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

const WEB_URL = 'https://dc-project-web.vercel.app'

const PLANS = [
  {
    id: 'basic' as const,
    name: 'Básico',
    price: 1500,
    features: [
      'Inscribirse a clases',
      'Subir videos de baile',
      'Publicar clases (hasta 3 activas)',
      'Sistema de confianza',
    ],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 3500,
    features: [
      'Todo lo del plan Básico',
      'Clases ilimitadas',
      'Entrenamientos y audiciones',
      'Descuentos espontáneos',
      'Dashboard de analytics (próximamente)',
    ],
    highlight: true,
  },
]

export default function PlansScreen() {
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('none')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!user) return
      setAccessToken(session?.access_token ?? null)

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('tier')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      setCurrentTier((sub?.tier as SubscriptionTier) ?? 'none')
      setLoading(false)
    }
    load()
  }, [])

  async function handleSubscribe(planId: 'basic' | 'pro', period: 'monthly' | 'annual') {
    if (!accessToken) {
      Alert.alert('Error', 'Sesión no encontrada. Vuelve a iniciar sesión.')
      return
    }
    setCheckingOut(`${planId}-${period}`)
    try {
      const endpoint = period === 'monthly'
        ? `${WEB_URL}/api/mercadopago/create-subscription`
        : `${WEB_URL}/api/mercadopago/create-preference`

      const body = period === 'annual'
        ? { plan: planId, period: 'annual' }
        : { plan: planId }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Error al iniciar el pago')
      }

      const { init_point } = await res.json()
      if (!init_point) throw new Error('No se recibió URL de pago')

      await WebBrowser.openBrowserAsync(init_point)
      // After browser closes, refresh subscription status
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('tier')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single()
        setCurrentTier((sub?.tier as SubscriptionTier) ?? 'none')
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo abrir el checkout')
    }
    setCheckingOut(null)
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="bg-white dark:bg-dark-surface px-4 py-4 border-b border-gray-100 dark:border-dark-border flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-brand-600 text-base">‹ Volver</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Planes</Text>
        </View>

        <View className="p-4 gap-4">
          <View className="items-center pt-2 pb-4">
            <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">Elige tu plan</Text>
            <Text className="text-sm text-gris-humo dark:text-dark-text2 mt-1 text-center">
              Accede a todas las funciones para enseñar y aprender baile
            </Text>
          </View>

          {currentTier !== 'none' && (
            <View className="bg-green-50 border border-green-200 rounded-2xl p-4 flex-row items-center gap-3">
              <CheckCircle2 size={20} stroke="#16a34a" />
              <Text className="text-green-800 font-semibold text-sm">
                Plan activo: {currentTier === 'basic' ? 'Básico' : currentTier === 'pro' ? 'Pro' : currentTier}
              </Text>
            </View>
          )}

          {PLANS.map((plan) => {
            const isActive = currentTier === plan.id
            const annualPrice = plan.price * 12
            const annualSavings = Math.round((plan.price * 2))

            return (
              <View
                key={plan.id}
                className={`rounded-2xl border overflow-hidden ${
                  plan.highlight
                    ? 'border-brand-300 bg-white dark:bg-dark-surface shadow-sm'
                    : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface'
                }`}
              >
                {plan.highlight && (
                  <View className="bg-brand-600 py-1.5 items-center">
                    <Text className="text-white text-xs font-bold tracking-wide">MÁS POPULAR</Text>
                  </View>
                )}

                <View className="p-5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-xl font-bold text-gray-900 dark:text-dark-text">{plan.name}</Text>
                    <View className="flex-row items-baseline gap-0.5">
                      <Text className="text-2xl font-bold text-gray-900 dark:text-dark-text">{formatCLP(plan.price)}</Text>
                      <Text className="text-xs text-gris-humo dark:text-dark-text2">/mes</Text>
                    </View>
                  </View>

                  <View className="gap-2 mt-4 mb-5">
                    {plan.features.map((f) => (
                      <View key={f} className="flex-row items-start gap-2">
                        <CheckCircle2 size={14} stroke="#c026d3" />
                        <Text className="text-sm text-gray-700 dark:text-dark-text2 flex-1">{f}</Text>
                      </View>
                    ))}
                  </View>

                  {isActive ? (
                    <View className="border border-brand-200 bg-brand-50 rounded-xl py-3 items-center">
                      <Text className="text-brand-600 font-semibold text-sm">Plan actual</Text>
                    </View>
                  ) : (
                    <View className="gap-2">
                      {/* Monthly — credit card only */}
                      <TouchableOpacity
                        onPress={() => handleSubscribe(plan.id, 'monthly')}
                        disabled={!!checkingOut}
                        className={`flex-row items-center gap-3 px-4 py-3 rounded-xl bg-brand-600 ${checkingOut ? 'opacity-60' : ''}`}
                      >
                        <CreditCard size={16} stroke="white" />
                        <View className="flex-1">
                          <Text className="text-white font-semibold text-sm">
                            {checkingOut === `${plan.id}-monthly`
                              ? 'Abriendo checkout...'
                              : `Mensual · ${formatCLP(plan.price)}`}
                          </Text>
                          <Text className="text-white text-xs opacity-75">Cobro automático · solo tarjeta de crédito</Text>
                        </View>
                      </TouchableOpacity>

                      {/* Annual — any payment method */}
                      <TouchableOpacity
                        onPress={() => handleSubscribe(plan.id, 'annual')}
                        disabled={!!checkingOut}
                        className={`flex-row items-center gap-3 px-4 py-3 rounded-xl border-2 border-brand-200 dark:border-brand-600 dark:bg-dark-surface2 ${checkingOut ? 'opacity-60' : ''}`}
                      >
                        <Wallet size={16} stroke="#7F77DD" />
                        <View className="flex-1">
                          <Text className="text-brand-700 dark:text-dark-text font-semibold text-sm">
                            {checkingOut === `${plan.id}-annual`
                              ? 'Abriendo checkout...'
                              : `Anual · ${formatCLP(annualPrice)}`}
                          </Text>
                          <Text className="text-brand-500 dark:text-dark-text2 text-xs">
                            Pago único · cualquier medio · ahorras {formatCLP(annualSavings)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )
          })}

          {/* Footer note */}
          <View className="items-center pb-4">
            <Text className="text-xs text-gris-humo dark:text-dark-text2 text-center">
              Los pagos son procesados de forma segura por Mercado Pago.{'\n'}
              Podés cancelar en cualquier momento.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
