import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { SUBSCRIPTION_PLANS, formatCLP } from '@danceclass/shared'
import { Check, Crown } from 'lucide-react'

export default async function PlansPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const currentTier = await getActiveTier(user.id, supabase)

  return (
    <div className="px-4 py-6">
      <div className="mb-6 text-center">
        <Crown className="h-8 w-8 text-brand-500 mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-gray-900">Elige tu plan</h1>
        <p className="text-sm text-gray-500 mt-1">Cancela cuando quieras</p>
      </div>

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
                    <h2 className="text-base font-bold text-gray-900">{plan.name}</h2>
                    {isActive && (
                      <span className="badge bg-brand-100 text-brand-700 text-xs">Activo</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatCLP(plan.price)}</p>
                  <p className="text-xs text-gray-400">/mes</p>
                </div>
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-brand-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isActive ? (
                <div className="w-full py-2.5 text-center text-sm font-medium text-brand-600 bg-brand-50 rounded-xl border border-brand-200">
                  Plan actual
                </div>
              ) : (
                <div className="w-full py-2.5 text-center text-sm font-medium text-gray-400 bg-gray-50 rounded-xl border border-gray-200 cursor-not-allowed">
                  Próximamente — pago con Mercado Pago
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Los pagos serán procesados mensualmente por Mercado Pago.
        <br />Puedes cancelar en cualquier momento desde tu perfil.
      </p>
    </div>
  )
}
