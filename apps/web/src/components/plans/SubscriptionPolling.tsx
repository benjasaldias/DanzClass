'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  /** tier already confirmed server-side (may be 'none' if webhook hasn't fired yet) */
  initialTier: string
}

export function SubscriptionPolling({ initialTier }: Props) {
  const [tier, setTier] = useState(initialTier)
  const [attempts, setAttempts] = useState(0)
  const maxAttempts = 15 // ~30 sec

  useEffect(() => {
    if (tier !== 'none' || attempts >= maxAttempts) return

    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/subscriptions/status')
        const data = await res.json()
        setTier(data.tier ?? 'none')
      } catch {
        // ignore
      }
      setAttempts((n) => n + 1)
    }, 2000)

    return () => clearTimeout(id)
  }, [tier, attempts, maxAttempts])

  if (tier !== 'none') {
    return <p className="text-gray-500 dark:text-dark-text2 text-sm mb-1">Tu suscripción está activa.</p>
  }

  if (attempts >= maxAttempts) {
    return (
      <p className="text-amber-600 dark:text-amber-400 text-sm mb-1">
        Tu pago se está procesando. Revisa tu plan en unos minutos.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 text-gray-400 dark:text-dark-text2/60 text-sm mb-1">
      <Loader2 className="h-4 w-4 animate-spin" />
      Confirmando suscripción…
    </div>
  )
}
