'use client'

import { useState } from 'react'
import { X, Loader2, Tag } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface DiscountModalProps {
  classId: string
  classType: string
  currentPrice: number
  currentPriceSuelta: number | null
  currentDiscountPrice: number | null
  currentDiscountPriceMonthly: number | null
  onClose: () => void
  onSaved: () => void
}

export default function DiscountModal({
  classId,
  classType,
  currentPrice,
  currentPriceSuelta,
  currentDiscountPrice,
  currentDiscountPriceMonthly,
  onClose,
  onSaved,
}: DiscountModalProps) {
  const isPeriodica = classType === 'periodica' || classType === 'entrenamiento'

  const [discountPrice, setDiscountPrice] = useState<string>(
    currentDiscountPrice ? String(currentDiscountPrice) : ''
  )
  const [discountPriceMonthly, setDiscountPriceMonthly] = useState<string>(
    currentDiscountPriceMonthly ? String(currentDiscountPriceMonthly) : ''
  )
  const [notifyEnrolled, setNotifyEnrolled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose, !saving)

  async function handleSave() {
    setSaving(true)
    setError(null)

    const dp = discountPrice ? parseInt(discountPrice) : null
    const dpm = discountPriceMonthly ? parseInt(discountPriceMonthly) : null

    if (dp !== null && dp >= currentPrice) {
      setError('El precio con descuento debe ser menor al precio original')
      setSaving(false)
      return
    }
    if (dpm !== null && isPeriodica && dpm >= currentPrice) {
      setError('El precio mensual con descuento debe ser menor al precio mensual original')
      setSaving(false)
      return
    }

    const res = await fetch('/api/class/discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: classId,
        discount_price: dp,
        discount_price_monthly: isPeriodica ? dpm : null,
        notify_enrolled: notifyEnrolled,
      }),
    })

    if (!res.ok) {
      setError('Error al guardar. Intenta de nuevo.')
    } else {
      onSaved()
    }
    setSaving(false)
  }

  async function handleClear() {
    setSaving(true)
    await fetch('/api/class/discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classId, discount_price: null, discount_price_monthly: null }),
    })
    onSaved()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl bg-white dark:bg-dark-surface p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral-fuego/15">
              <Tag className="h-4 w-4 text-coral-fuego" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">Precio con descuento</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
            <X className="h-4 w-4 text-gray-500 dark:text-dark-text2" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>
        )}

        <div className="space-y-4">
          {/* Suelta or suelta-within-periodica */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              {isPeriodica ? 'Precio clase suelta con descuento' : 'Precio con descuento'}
              <span className="ml-2 text-xs text-gray-400 dark:text-dark-text2/60 font-normal">
                (original: {formatCLP(currentPriceSuelta ?? currentPrice)})
              </span>
            </label>
            <input
              type="number"
              min={0}
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value)}
              placeholder="ej: 8000"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-dark-text2/60">
              Deja vacío para no aplicar descuento{isPeriodica ? ' en suelta' : ''}
            </p>
          </div>

          {/* Monthly price discount (only for periodica/entrenamiento) */}
          {isPeriodica && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
                Precio mensual con descuento
                <span className="ml-2 text-xs text-gray-400 dark:text-dark-text2/60 font-normal">
                  (original: {formatCLP(currentPrice)})
                </span>
              </label>
              <input
                type="number"
                min={0}
                value={discountPriceMonthly}
                onChange={(e) => setDiscountPriceMonthly(e.target.value)}
                placeholder="ej: 12000"
                className="input"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-dark-text2/60">Deja vacío para no aplicar descuento mensual</p>
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyEnrolled}
              onChange={(e) => setNotifyEnrolled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700 dark:text-dark-text2">
              Notificar también a alumnos inscritos con pago pendiente
              <span className="block text-xs text-gray-400 dark:text-dark-text2/60 mt-0.5">
                El descuento ya aplica automáticamente a su próximo pago
              </span>
            </span>
          </label>

          <p className="text-xs text-gris-humo bg-coral-fuego/10 border border-coral-fuego/20 rounded-xl px-3 py-2">
            Al publicar, se notificará a todos tus seguidores sobre el descuento.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          {(currentDiscountPrice || currentDiscountPriceMonthly) && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="rounded-xl border border-gray-200 dark:border-dark-border px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-50"
            >
              Quitar descuento
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-coral-fuego px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-fuego/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Publicar descuento
          </button>
        </div>
      </div>
    </div>
  )
}
