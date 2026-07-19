'use client'

import { useState } from 'react'
import { Sparkles, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AdminSettingsClient({ initialAutoConfirmEnabled }: { initialAutoConfirmEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialAutoConfirmEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle() {
    const next = !enabled
    const previous = enabled
    setEnabled(next)
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'auto_confirm_enabled', value: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setEnabled(previous)
      setError('No se pudo guardar el cambio. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lavanda-suave text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200">
            <Sparkles className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Auto-confirmación de pagos con IA</p>
              <button
                onClick={handleToggle}
                disabled={saving}
                aria-label="Auto-confirmación de pagos con IA"
                className={cn(
                  'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60',
                  enabled ? 'bg-morado-flow' : 'bg-gray-300 dark:bg-dark-border',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                    enabled ? 'left-[1.375rem]' : 'left-0.5',
                  )}
                />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-dark-text2">
              {enabled
                ? 'Activado: los pagos que la IA marque como veredicto "limpio" (ai_verdict = clean) se confirman automáticamente, sin que el profesor los revise.'
                : 'Desactivado (por defecto, conservador): todo pago requiere confirmación manual del profesor, incluso si la IA no detectó ningún problema.'}
            </p>

            <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                Aún no hay un servicio de escaneo de IA activo — ningún pago recibe hoy un veredicto distinto de "none". Este ajuste queda guardado y listo para cuando el servicio se conecte, pero por ahora no cambia nada visible.
              </p>
            </div>

            {saving && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-dark-text2">
                <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
              </p>
            )}
            {error && <p className="mt-2 text-[11px] text-red-500 dark:text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
