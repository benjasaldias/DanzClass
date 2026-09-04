// ⚠️ PANTALLA DESACTIVADA — no es una ruta.
//
// Es la página de planes tal como estaba antes del lanzamiento gratuito
// (2026-09-04), preservada íntegra acá para poder reactivar el cobro sin
// arqueología de git. En el App Router sólo `page.tsx`/`route.ts`/`layout.tsx`
// crean rutas, así que este archivo no es alcanzable por URL.
//
// Para reactivar: pegar este contenido de vuelta en `page.tsx` (quitando esta
// cabecera y renombrando el componente), y revisar antes que las viñetas de
// `SUBSCRIPTION_PLANS` sigan siendo ciertas — la de "sin comisión de servicio"
// se eliminó porque hoy la comisión la paga cualquier alumno
// (`COMMISSION_APPLIES_TO_ALL_TIERS` en packages/shared/src/lib/commission.ts).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveSubscription, getCancelledPendingExpiry } from '@/lib/subscription'
import { SUBSCRIPTION_PLANS, formatCLP } from '@danceclass/shared'
import { Check, Crown, AlertCircle } from 'lucide-react'
import { SubscribeButton } from '@/components/plans/SubscribeButton'
import { CancelSubscriptionButton } from '@/components/plans/CancelSubscriptionButton'

function formatDate(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function DisabledPlansPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const activeSub = await getActiveSubscription(user.id, supabase)
  const cancelledSub = activeSub ? null : await getCancelledPendingExpiry(user.id, supabase)
  const currentTier = activeSub?.tier ?? 'none'

  return (
    <div className="px-4 py-6">
      <div className="mb-6 text-center">
        <Crown className="h-8 w-8 text-brand-500 mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Elige tu plan</h1>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">Cancela cuando quieras</p>
      </div>

      {cancelledSub && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tu suscripción fue cancelada. Tienes acceso hasta el{' '}
            <span className="font-semibold">{formatDate(cancelledSub.expires_at)}</span>.
            No se realizarán nuevos cobros.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isActive = currentTier === plan.tier
          return (
            <div
              key={plan.tier}
              className={`card p-5 border-2 transition-colors ${
                isActive ? 'border-brand-500 bg-brand-50/50' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">{plan.name}</h2>
                    {isActive && (
                      <span className="badge bg-brand-100 text-brand-700 text-xs">Activo</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-dark-text2">{plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 dark:text-dark-text">{formatCLP(plan.price)}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-text2/60">/mes</p>
                </div>
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text2">
                    <Check className="h-4 w-4 text-brand-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <SubscribeButton plan={plan.tier} currentTier={currentTier} price={plan.price} />

              {isActive && activeSub && (
                <div className="mt-3 flex flex-col items-center gap-1">
                  <p className="text-xs text-gray-400 dark:text-dark-text2/60">
                    Vence el {formatDate(activeSub.expires_at)}
                  </p>
                  <CancelSubscriptionButton expiresAt={activeSub.expires_at} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400 dark:text-dark-text2/60">
        Los pagos son procesados por Mercado Pago. Al cancelar, tu plan
        sigue activo hasta la fecha de vencimiento.
      </p>
    </div>
  )
}
