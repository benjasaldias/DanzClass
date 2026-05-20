'use client'

import { useState } from 'react'
import { CreditCard, Wallet } from 'lucide-react'
import { formatCLP } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface Props {
  plan: Exclude<SubscriptionTier, 'none'>
  currentTier: SubscriptionTier
  price: number
}

async function redirectToCheckout(endpoint: string, body: object) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Error al iniciar el pago')
  const { init_point } = await res.json()
  window.location.href = init_point
}

export function SubscribeButton({ plan, currentTier, price }: Props) {
  const [loadingMonthly, setLoadingMonthly] = useState(false)
  const [loadingAnnual, setLoadingAnnual] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = currentTier === plan
  const loading = loadingMonthly || loadingAnnual

  async function handleMonthly() {
    setLoadingMonthly(true)
    setError(null)
    try {
      await redirectToCheckout('/api/mercadopago/create-subscription', { plan })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setLoadingMonthly(false)
    }
  }

  async function handleAnnual() {
    setLoadingAnnual(true)
    setError(null)
    try {
      await redirectToCheckout('/api/mercadopago/create-preference', { plan, period: 'annual' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setLoadingAnnual(false)
    }
  }

  if (isActive) {
    return (
      <div className="w-full py-2.5 text-center text-sm font-medium text-brand-600 bg-brand-50 rounded-xl border border-brand-200">
        Plan actual
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Mensual — solo tarjeta de crédito */}
      <button
        onClick={handleMonthly}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <CreditCard className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold leading-none">
            {loadingMonthly ? 'Redirigiendo...' : `Mensual · ${formatCLP(price)}`}
          </p>
          <p className="text-[11px] opacity-75 mt-0.5">Cobro automático · solo tarjeta de crédito</p>
        </div>
      </button>

      {/* Anual — cualquier medio de pago */}
      <button
        onClick={handleAnnual}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-brand-200 dark:border-brand-700 bg-white dark:bg-dark-surface2 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Wallet className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold leading-none">
            {loadingAnnual ? 'Redirigiendo...' : `Anual · ${formatCLP(price * 12)}`}
          </p>
          <p className="text-[11px] opacity-75 mt-0.5">Pago único · cualquier medio de pago</p>
        </div>
      </button>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}
