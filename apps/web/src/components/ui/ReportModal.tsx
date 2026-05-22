'use client'

import { useState } from 'react'
import { X, Loader2, Flag } from 'lucide-react'

type Reason = 'copyright' | 'inappropriate' | 'spam' | 'other'
type ContentType = 'post' | 'class'

interface ReportModalProps {
  contentType: ContentType
  contentId: string
  reporterId: string
  onClose: () => void
}

const REASONS: { value: Reason; label: string; description: string }[] = [
  {
    value: 'copyright',
    label: 'Infracción de derechos de autor',
    description: 'Audio o video con derechos de autor sin autorización',
  },
  {
    value: 'inappropriate',
    label: 'Contenido inapropiado',
    description: 'Contenido ofensivo, violento o para adultos',
  },
  {
    value: 'spam',
    label: 'Spam',
    description: 'Publicidad no deseada o contenido repetitivo',
  },
  {
    value: 'other',
    label: 'Otro',
    description: 'Otra razón no listada anteriormente',
  },
]

export default function ReportModal({ contentType, contentId, reporterId: _reporterId, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<Reason | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) { setError('Selecciona una razón para el reporte'); return }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, contentId, reason, description }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.error === 'duplicate' || res.status === 409) {
        setError('Ya reportaste este contenido anteriormente.')
      } else {
        setError('Error al enviar el reporte. Intenta de nuevo.')
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-dark-surface p-6 shadow-2xl text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <Flag className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-dark-text mb-1">Reporte enviado</h3>
          <p className="text-sm text-gray-500 dark:text-dark-text2 mb-5">
            Gracias por ayudarnos a mantener la comunidad segura. Revisaremos tu reporte a la brevedad.
          </p>
          <button onClick={onClose} className="btn-primary w-full py-2.5">Cerrar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-dark-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">Reportar contenido</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-dark-text2 hover:text-gray-600 dark:hover:text-dark-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            {REASONS.map(({ value, label, description: desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setReason(value)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  reason === value
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2'
                }`}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{label}</p>
                <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              Detalles adicionales <span className="text-gray-400 dark:text-dark-text2/60 font-normal">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el problema con más detalle..."
              rows={3}
              maxLength={500}
              className="input resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !reason}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Enviar reporte'}
          </button>
        </form>
      </div>
    </div>
  )
}
