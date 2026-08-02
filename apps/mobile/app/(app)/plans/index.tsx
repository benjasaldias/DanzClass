import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CheckCircle2, Globe, XCircle } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import {
  formatCLP,
  getActiveSubscription,
  getCancelledPendingExpiry,
  SUBSCRIPTION_PLANS,
  WEB_URL,
} from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

// Mismo formato que `CancelSubscriptionButton.tsx` (web): `expires_at` es un
// TIMESTAMPTZ completo, no un YYYY-MM-DD — hay que tomar solo la fecha y
// construirla en hora local para evitar el off-by-one de `new Date(iso)`.
function formatExpiryDate(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// WHY_NO_PURCHASE_IN_APP — no borrar sin leer esto (sesión 2026-08-02)
// ---------------------------------------------------------------------------
// Esta pantalla NO vende suscripciones, a propósito. Hasta esta sesión tenía
// dos botones ("Mensual" / "Anual") que abrían el checkout de Mercado Pago
// dentro de la app con `WebBrowser.openBrowserAsync(init_point)`.
//
// Eso es exactamente lo que App Store (guía 3.1.1) y Google Play (Payments
// policy) prohíben: contenido o funcionalidad DIGITAL que se desbloquea dentro
// de la app —acá, publicar clases y subir videos— debe venderse por el sistema
// de compras de la tienda. La sanción no es una comisión (las tiendas no tienen
// forma de cobrar sobre un pago de Mercado Pago): es el RECHAZO de la app en
// revisión. Un revisor abre esta pantalla, toca "Suscribirse", ve Mercado Pago
// y rechaza la publicación.
//
// ⚠️ Redirigir a danzclass.com TAMPOCO sirve, que es la intuición natural:
// las reglas anti-steering (guía 3.1.3) prohíben enlazar a un mecanismo de
// compra externo desde adentro de la app. En EE.UU. eso cambió tras un fallo
// judicial de 2025; Chile no está cubierto por esa excepción ni por las de la
// UE. Por eso el aviso de abajo es texto plano SIN link tocable.
//
// LO QUE SÍ ESTÁ PERMITIDO Y NO HAY QUE TOCAR: los pagos de CLASES por Mercado
// Pago (todo el marketplace, `PaymentClient`, `create-payment`, el 2% de
// comisión y el gross-up). Una clase de baile es un servicio físico presencial
// que se consume FUERA de la app — el mismo caso de Uber o Airbnb, permitido
// explícitamente por la guía 3.1.5(a). La restricción aplica sólo a la
// suscripción a los planes.
//
// Si algún día se quiere volver a vender desde la app, la única vía compatible
// es integrar Apple IAP + Google Play Billing (15-30% de comisión), no
// reponer estos botones. Ver `audit3.md` §9.2 U-8.
// ---------------------------------------------------------------------------

// Fuente única: `SUBSCRIPTION_PLANS` (packages/shared) es lo que alimenta
// también la página de planes de la web. Acá había un array duplicado que se
// había desincronizado y prometía cosas que no son ciertas:
//   - "Publicar clases (hasta 3 activas)" cuando el Básico permite 1 clase
//     suelta POR MES — un tope que la migración 075 ahora hace cumplir en la
//     base, así que el segundo intento sería rechazado con la app prometiendo
//     lo contrario.
//   - "Sistema de confianza", eliminado en 2026-05-22 (lo reemplazaron las
//     valoraciones con estrellas).
//   - "Dashboard de analytics (próximamente)", que existe desde 2026-05-31
//     como Panel Financiero.
const PLANS = SUBSCRIPTION_PLANS.map((p) => ({
  id: p.tier,
  name: p.name,
  price: p.price,
  features: p.features as readonly string[],
  highlight: p.tier === 'pro',
}))

export default function PlansScreen() {
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('none')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [cancelledExpiry, setCancelledExpiry] = useState<{ tier: SubscriptionTier; expires_at: string } | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  async function refreshSubscriptionState(userId: string) {
    const [sub, cancelled] = await Promise.all([
      getActiveSubscription(userId, supabase),
      getCancelledPendingExpiry(userId, supabase),
    ])
    setCurrentTier(sub?.tier ?? 'none')
    setExpiresAt(sub?.expires_at ?? null)
    setCancelledExpiry(cancelled)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!user) return
      setAccessToken(session?.access_token ?? null)

      await refreshSubscriptionState(user.id)
      setLoading(false)
    }
    load()
  }, [])

  // P1-5: la pantalla prometía "Podés cancelar en cualquier momento" sin
  // ningún botón que lo hiciera, y aunque hubiera existido no habría
  // funcionado — `/api/subscriptions/cancel` sólo aceptaba cookie. Mismo
  // flujo y mismo texto que `CancelSubscriptionButton.tsx` (web).
  function handleCancelSubscription() {
    if (!accessToken || !expiresAt) return
    Alert.alert(
      '¿Cancelar suscripción?',
      `Tu plan seguirá activo hasta el ${formatExpiryDate(expiresAt)}. No se realizarán más cobros.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            try {
              const res = await fetch(`${WEB_URL}/api/subscriptions/cancel`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (!res.ok) throw new Error()
              const { data: { user } } = await supabase.auth.getUser()
              if (user) await refreshSubscriptionState(user.id)
            } catch {
              Alert.alert('Error', 'No se pudo cancelar la suscripción. Intenta de nuevo.')
            }
            setCancelling(false)
          },
        },
      ]
    )
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
            <View className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex-row items-center gap-3">
              <CheckCircle2 size={20} stroke="#16a34a" />
              <Text className="text-green-800 dark:text-green-400 font-semibold text-sm flex-1">
                Plan activo: {currentTier === 'basic' ? 'Básico' : currentTier === 'pro' ? 'Pro' : currentTier}
              </Text>
              <TouchableOpacity onPress={handleCancelSubscription} disabled={cancelling}>
                <Text className="text-xs text-gray-400 dark:text-dark-text2 underline">
                  {cancelling ? 'Cancelando…' : 'Cancelar plan'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {cancelledExpiry && (
            <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex-row items-start gap-3">
              <XCircle size={18} stroke="#d97706" style={{ marginTop: 2 }} />
              <Text className="text-amber-700 dark:text-amber-400 text-sm flex-1">
                Tu suscripción fue cancelada. Tienes acceso hasta el{' '}
                <Text className="font-semibold">{formatExpiryDate(cancelledExpiry.expires_at)}</Text>.
                No se realizarán nuevos cobros.
              </Text>
            </View>
          )}

          {PLANS.map((plan) => {
            const isActive = currentTier === plan.id

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

                  {/* Sólo se marca el plan activo. Los demás no llevan
                      ningún botón ni etiqueta de compra — ver
                      `WHY_NO_PURCHASE_IN_APP` arriba; dónde se contrata se
                      dice UNA vez al pie de la pantalla, no por tarjeta. */}
                  {isActive && (
                    <View className="border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-dark-surface2 rounded-xl py-3 items-center">
                      <Text className="text-brand-600 dark:text-brand-300 font-semibold text-sm">Plan actual</Text>
                    </View>
                  )}
                </View>
              </View>
            )
          })}

          {/* Dónde se contrata. Texto plano, NO tocable, y una sola vez en la
              pantalla — ver `WHY_NO_PURCHASE_IN_APP` arriba. */}
          <View className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl p-4 flex-row items-start gap-3">
            <Globe size={18} stroke="#7F77DD" style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-1">
                Contratar un plan
              </Text>
              <Text className="text-xs text-gris-humo dark:text-dark-text2 leading-5">
                Los planes se contratan y gestionan desde el sitio web de DanzClass,
                con tu misma cuenta. Una vez activo, se refleja acá automáticamente.
              </Text>
            </View>
          </View>

          {/* Footer note */}
          <View className="items-center pb-4">
            <Text className="text-xs text-gris-humo dark:text-dark-text2 text-center">
              Podés cancelar en cualquier momento.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
