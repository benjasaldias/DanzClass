'use client'

import { useState } from 'react'
import { X, Star } from 'lucide-react'
import StarRating from './StarRating'

interface RatingModalProps {
  teacherId: string
  teacherName: string
  raterId: string
  initialRating?: number | null
  onClose: () => void
  onRate: (stars: number) => void
}

export default function RatingModal({
  teacherId,
  teacherName,
  raterId,
  initialRating,
  onClose,
  onRate,
}: RatingModalProps) {
  const [selected, setSelected] = useState<number>(initialRating ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!initialRating

  async function handleSubmit() {
    if (selected < 1) { setError('Selecciona al menos 1 estrella'); return }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/ratings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rated_user_id: teacherId, stars: selected }),
    })

    if (!res.ok) {
      setError('No se pudo guardar la valoración. Intenta de nuevo.')
      setLoading(false)
      return
    }

    onRate(selected)
    onClose()
  }

  const labels: Record<number, string> = {
    1: 'Malo', 2: 'Regular', 3: 'Bueno', 4: 'Muy bueno', 5: 'Excelente',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-2xl border border-gray-100 dark:border-dark-border p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600/10">
            <Star className="h-4 w-4 text-brand-600" />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">
            {isEdit ? 'Editar valoración' : 'Valorar profesor'}
          </h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mb-6 ml-11">
          {teacherName}
        </p>

        <div className="flex flex-col items-center gap-3 mb-6">
          <StarRating value={selected} onChange={setSelected} size="lg" />
          <p className="text-sm font-medium text-gray-600 dark:text-dark-text2 h-5">
            {selected > 0 ? labels[selected] ?? '' : 'Toca para valorar'}
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading || selected < 1}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : isEdit ? 'Actualizar' : 'Publicar valoración'}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 dark:border-dark-border px-4 py-2.5 text-sm text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
