'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Link2, Loader2, AlertTriangle, X } from 'lucide-react'

interface MpConnectCardProps {
  connected: boolean
}

const STATUS_MESSAGES: Record<string, { kind: 'ok' | 'error'; text: string }> = {
  connected: { kind: 'ok', text: 'Tu cuenta de Mercado Pago quedó conectada. Ya puedes recibir pagos in-app.' },
  cancelled: { kind: 'error', text: 'Cancelaste la conexión con Mercado Pago.' },
  account_in_use: { kind: 'error', text: 'Esa cuenta de Mercado Pago ya está vinculada a otro profesor.' },
  error: { kind: 'error', text: 'No pudimos conectar tu cuenta de Mercado Pago. Intenta de nuevo.' },
}

export default function MpConnectCard({ connected }: MpConnectCardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [disconnecting, setDisconnecting] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [disconnectNote, setDisconnectNote] = useState<string | null>(null)

  const status = searchParams?.get('mp') ?? null
  const banner = status && !dismissed ? STATUS_MESSAGES[status] : null

  async function handleDisconnect() {
    if (!confirm('¿Desconectar tu cuenta de Mercado Pago? Dejarás de recibir pagos in-app hasta reconectarla.')) return
    setDisconnecting(true)
    const res = await fetch('/api/mercadopago/oauth/disconnect', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setDisconnecting(false)

    // P2-4: las clases que solo aceptaban Mercado Pago quedan aceptando
    // transferencia, para que los alumnos con pago pendiente no se queden sin
    // ninguna vía. Lo único que no se puede reparar solo es la falta de datos
    // bancarios: eso hay que decírselo.
    if (data?.classesRepaired > 0) {
      const clases = data.classesRepaired === 1 ? '1 clase tuya pasó' : `${data.classesRepaired} clases tuyas pasaron`
      const alumnos = data.affectedStudents > 0
        ? ` Hay ${data.affectedStudents} ${data.affectedStudents === 1 ? 'alumno' : 'alumnos'} con pago pendiente en ellas.`
        : ''
      setDisconnectNote(
        data.hasPaymentInfo
          ? `${clases} a aceptar transferencia para que tus alumnos puedan seguir pagándote.${alumnos}`
          : `${clases} a aceptar transferencia, pero todavía no cargaste tus datos bancarios: hasta que lo hagas, tus alumnos no tienen cómo pagarte.${alumnos}`
      )
    }
    router.refresh()
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#EEEDFE] dark:bg-dark-surface2">
          <Link2 className="h-5 w-5 text-[#534AB7] dark:text-brand-300" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Pagos in-app (Mercado Pago)</h3>
          <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
            Conecta tu cuenta de Mercado Pago para que los alumnos sin plan puedan pagarte dentro de la app.
            Recibes el precio completo de tu clase; DanzClass cobra su comisión aparte.
          </p>
        </div>
      </div>

      {banner && (
        <div
          className={
            banner.kind === 'ok'
              ? 'flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400'
              : 'flex items-center gap-2 rounded-xl border border-coral-fuego/30 bg-coral-fuego/10 p-3 text-sm text-gray-700 dark:text-dark-text'
          }
        >
          {banner.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 text-coral-fuego" />}
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setDismissed(true)} aria-label="Cerrar" className="flex-shrink-0">
            <X className="h-4 w-4 opacity-60" />
          </button>
        </div>
      )}

      {disconnectNote && (
        <div className="flex items-start gap-2 rounded-xl border border-coral-fuego/30 bg-coral-fuego/10 p-3 text-sm text-gray-700 dark:text-dark-text">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-coral-fuego mt-0.5" />
          <span className="flex-1">{disconnectNote}</span>
          <button onClick={() => setDisconnectNote(null)} aria-label="Cerrar" className="flex-shrink-0">
            <X className="h-4 w-4 opacity-60" />
          </button>
        </div>
      )}

      {connected ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            Cuenta conectada
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-2 text-sm font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Desconectar
          </button>
        </div>
      ) : (
        <a
          href="/api/mercadopago/oauth/connect"
          className="btn-primary w-full py-3 text-sm justify-center"
        >
          <Link2 className="h-4 w-4" />
          Conectar Mercado Pago
        </a>
      )}
    </div>
  )
}
