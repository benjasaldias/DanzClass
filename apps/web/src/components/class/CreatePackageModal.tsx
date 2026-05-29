'use client'

import { useState } from 'react'
import { X, Package, CheckCircle2 } from 'lucide-react'
import { cn, formatCLP } from '@/lib/utils'
import useEscapeKey from '@/hooks/useEscapeKey'

type Props = {
  classes: any[]
  onClose: () => void
  onCreated: (pkg: any) => void
}

export default function CreatePackageModal({ classes, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose, !loading)

  function toggleClass(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleCreate() {
    if (!title.trim()) { setError('El título es obligatorio.'); return }
    if (selectedIds.length < 2) { setError('Selecciona al menos 2 clases.'); return }
    const priceNum = parseInt(price, 10)
    if (!priceNum || priceNum <= 0) { setError('El precio debe ser mayor a 0.'); return }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, price: priceNum, class_ids: selectedIds }),
    })

    if (res.ok) {
      const { package: pkg } = await res.json()
      onCreated(pkg)
    } else {
      const data = await res.json()
      setError(data.error === 'invalid_classes' ? 'Algunas clases no son válidas.' : 'Error al crear el paquete. Intenta de nuevo.')
    }
    setLoading(false)
  }

  const noExp = (e: React.KeyboardEvent) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-dark-surface shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">Crear paquete de clases</h2>
          </div>
          <button onClick={!loading ? onClose : undefined} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-dark-text2 mb-1.5 block">
              Nombre del paquete <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Pack House + Popping"
              className="input w-full"
              maxLength={80}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-dark-text2 mb-1.5 block">Descripción (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Combinación perfecta para principiantes. Ahorra inscribiéndote a las dos juntas."
              className="input w-full resize-none h-20 text-sm"
              maxLength={200}
            />
          </div>

          {/* Price */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-dark-text2 mb-1.5 block">
              Precio del paquete (CLP) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={noExp}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="Ej. 25000"
              min={1}
              max={10_000_000}
              step={1}
              className="input w-full"
            />
            {price && parseInt(price, 10) > 0 && (
              <p className="text-xs text-gray-500 dark:text-dark-text2 mt-1">{formatCLP(parseInt(price, 10))}</p>
            )}
          </div>

          {/* Class selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-dark-text2 mb-2 block">
              Clases incluidas <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">(mínimo 2)</span>
            </label>
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-dark-text2">No tienes clases activas para incluir.</p>
            ) : (
              <div className="space-y-2">
                {classes.map((cls: any) => {
                  const isSelected = selectedIds.includes(cls.id)
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.id)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        isSelected
                          ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-600'
                          : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 hover:border-gray-300'
                      )}
                    >
                      <div className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected ? 'border-violet-500 bg-violet-500' : 'border-gray-300 dark:border-dark-border'
                      )}>
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">{cls.title}</p>
                        {cls.dance_style && (
                          <p className="text-xs text-gray-500 dark:text-dark-text2">{cls.dance_style}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-dark-border flex-shrink-0 flex gap-3">
          <button
            onClick={!loading ? onClose : undefined}
            className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border py-2.5 text-sm font-semibold text-gray-700 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || selectedIds.length < 2 || !title.trim() || !price}
            className={cn('flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors', (loading || selectedIds.length < 2) && 'opacity-60')}
          >
            {loading ? 'Creando...' : 'Crear paquete'}
          </button>
        </div>
      </div>
    </div>
  )
}
