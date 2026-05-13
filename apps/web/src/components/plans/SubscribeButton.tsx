'use client'

import { useState } from 'react'
import type { SubscriptionTier } from '@danceclass/shared'

interface Props {
  plan: Exclude<SubscriptionTier, 'none'>
  currentTier: SubscriptionTier
}

export function SubscribeButton({ plan, currentTier }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = currentTier === plan

  async function handleSubscribe() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mercadopago/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (!res.ok) throw new Error('Error al crear la preferencia de pago')
      const { init_point } = await res.json()
      window.location.href = init_point
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setLoading(false)
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
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="w-full py-2.5 text-center text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirigiendo...' : 'Suscribirse'}
      </button>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}
