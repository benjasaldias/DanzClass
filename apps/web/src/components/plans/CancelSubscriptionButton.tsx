'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

function formatDate(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

interface Props {
  expiresAt: string
}

export function CancelSubscriptionButton({ expiresAt }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions/cancel', { method: 'POST' })
      if (!res.ok) throw new Error()
      router.refresh()
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-1 underline underline-offset-2"
      >
        Cancelar plan
      </button>

      {open && (
        <ConfirmDialog
          title="¿Cancelar suscripción?"
          message={`Tu plan seguirá activo hasta el ${formatDate(expiresAt)}. No se realizarán más cobros.`}
          confirmLabel="Sí, cancelar"
          destructive
          loading={loading}
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}
