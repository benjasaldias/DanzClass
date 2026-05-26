'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Trash2 } from 'lucide-react'

export default function DeleteAccountPage() {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CONFIRM_PHRASE = 'ELIMINAR'
  const canDelete = confirm === CONFIRM_PHRASE

  async function handleDelete() {
    if (!canDelete) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/account/delete', { method: 'POST' })
    if (res.ok) {
      router.replace('/auth/login')
    } else {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Error al eliminar la cuenta. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-blanco-violeta dark:bg-dark-bg px-4 py-6 max-w-lg mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 flex-shrink-0">
            <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-dark-text">Eliminar cuenta</h1>
            <p className="text-sm text-gray-500 dark:text-dark-text2">Esta acción no se puede deshacer</p>
          </div>
        </div>

        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Al eliminar tu cuenta:</p>
          </div>
          <ul className="text-sm text-red-700 dark:text-red-400 space-y-1 pl-6 list-disc">
            <li>Perderás acceso permanente a tu perfil e inscripciones</li>
            <li>Tus clases publicadas serán canceladas</li>
            <li>Tu suscripción activa será cancelada</li>
            <li>Los pagos confirmados se mantienen por auditoría legal</li>
            <li>Tu nombre en publicaciones quedará como "Usuario eliminado"</li>
          </ul>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
            Para confirmar, escribe <strong className="text-red-600 dark:text-red-400">{CONFIRM_PHRASE}</strong>
          </label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="input w-full"
            autoCapitalize="characters"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={handleDelete}
          disabled={!canDelete || loading}
          className="w-full rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="inline-block h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Eliminar mi cuenta definitivamente
        </button>
      </div>
    </div>
  )
}
