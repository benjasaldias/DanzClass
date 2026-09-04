import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'

// ---------------------------------------------------------------------------
// PANTALLA DESACTIVADA — lanzamiento gratuito (2026-09-04)
// ---------------------------------------------------------------------------
// Toda cuenta nace con Pro sin costo (migración `078_free_pro_launch.sql`), así
// que no hay plan que mostrar ni que cancelar: la pantalla mostraría precios de
// algo que el usuario ya tiene gratis. Se redirige al perfil en vez de borrar la
// ruta porque `/(app)/plans` sigue referenciado desde varias pantallas (los CTAs
// de `!canTeach`, hoy inalcanzables porque todos son Pro) y una ruta inexistente
// en Expo Router es una pantalla en blanco, no un redirect.
//
// La UI anterior (lista de planes desde `SUBSCRIPTION_PLANS`, plan activo,
// banner de cancelación y botón "Cancelar plan") está en el historial de git, y
// su espejo web quedó preservado íntegro en
// `apps/web/src/app/(app)/plans/_disabled-plans-page.tsx`.
//
// ---------------------------------------------------------------------------
// WHY_NO_PURCHASE_IN_APP — no reponer botones de compra acá (sesión 2026-08-02)
// ---------------------------------------------------------------------------
// Esta pantalla nunca debe vender suscripciones, tampoco cuando se reactive el
// cobro. Hasta esa sesión tenía dos botones ("Mensual" / "Anual") que abrían el
// checkout de Mercado Pago dentro de la app con
// `WebBrowser.openBrowserAsync(init_point)`.
//
// Eso es lo que App Store (guía 3.1.1) y Google Play (Payments policy)
// prohíben: contenido o funcionalidad DIGITAL que se desbloquea dentro de la
// app —acá, publicar clases y subir videos— debe venderse por el sistema de
// compras de la tienda. La sanción no es una comisión (las tiendas no tienen
// forma de cobrar sobre un pago de Mercado Pago): es el RECHAZO de la app en
// revisión.
//
// ⚠️ Redirigir a danzclass.com TAMPOCO sirve, que es la intuición natural: las
// reglas anti-steering (guía 3.1.3) prohíben enlazar a un mecanismo de compra
// externo desde adentro de la app. En EE.UU. eso cambió tras un fallo judicial
// de 2025; Chile no está cubierto por esa excepción ni por las de la UE.
//
// LO QUE SÍ ESTÁ PERMITIDO Y NO HAY QUE TOCAR: los pagos de CLASES por Mercado
// Pago (todo el marketplace, `PaymentClient`, `create-payment`, el 2% de
// comisión y el gross-up). Una clase de baile es un servicio físico presencial
// que se consume FUERA de la app — el mismo caso de Uber o Airbnb, permitido
// explícitamente por la guía 3.1.5(a).
//
// Si algún día se quiere vender desde la app, la única vía compatible es
// integrar Apple IAP + Google Play Billing (15-30% de comisión), no reponer
// esos botones. Ver `audit3.md` §9.2 U-8.
// ---------------------------------------------------------------------------

export default function PlansScreen() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/(app)/(tabs)/profile' as any)
  }, [router])

  return (
    <View className="flex-1 items-center justify-center bg-blanco-violeta dark:bg-dark-bg">
      <ActivityIndicator color="#7F77DD" />
    </View>
  )
}
