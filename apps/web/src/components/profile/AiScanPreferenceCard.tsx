'use client'

import { useState } from 'react'
import { Sparkles, Eye, Check, Loader2 } from 'lucide-react'
import { getAiScanDisclaimer, type AiScanPreference } from '@danceclass/shared'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
  initialPreference: AiScanPreference | null
}

const OPTIONS: { value: AiScanPreference; icon: React.ElementType; title: string; sub: string }[] = [
  {
    value: 'ai',
    icon: Sparkles,
    title: 'IA escanea automáticamente',
    sub: 'La IA revisa cada comprobante al recibirlo y te avisa si encuentra algo raro.',
  },
  {
    value: 'manual',
    icon: Eye,
    title: 'Reviso manualmente',
    sub: 'Tú revisas y confirmas cada comprobante como hasta ahora, sin ayuda de IA.',
  },
]

export default function AiScanPreferenceCard({ userId, initialPreference }: Props) {
  const [preference, setPreference] = useState<AiScanPreference | null>(initialPreference)
  const [saving, setSaving] = useState<AiScanPreference | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  async function handleSelect(value: AiScanPreference) {
    if (value === preference || saving) return
    const previous = preference
    setPreference(value)
    setSaving(value)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ai_scan_preference: value })
      .eq('id', userId)

    setSaving(null)

    if (updateError) {
      setPreference(previous)
      setError('No se pudo guardar tu preferencia. Intenta de nuevo.')
      return
    }

    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <div className="space-y-2">
      {preference === null && (
        <span className="mb-1 inline-block rounded-full bg-coral-fuego/10 px-2.5 py-1 text-[11px] font-semibold text-coral-fuego">
          Aún no configurado
        </span>
      )}

      {OPTIONS.map(({ value, icon: Icon, title, sub }) => {
        const isSelected = preference === value
        return (
          <div key={value}>
            <button
              type="button"
              onClick={() => handleSelect(value)}
              disabled={saving !== null}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors disabled:opacity-70',
                isSelected
                  ? 'border-morado-flow bg-violet-50/60 dark:bg-dark-surface2'
                  : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-morado-flow/50',
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', isSelected ? 'text-morado-flow' : 'text-gray-400 dark:text-dark-text2')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none text-gray-900 dark:text-dark-text">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-dark-text2">{sub}</p>
              </div>
              {saving === value ? (
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-morado-flow" />
              ) : isSelected ? (
                <Check className="h-4 w-4 flex-shrink-0 text-morado-flow" />
              ) : null}
            </button>

            {value === 'ai' && (
              <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-gray-400 dark:text-dark-text2">
                {getAiScanDisclaimer('es')}
              </p>
            )}
          </div>
        )
      })}

      {savedFlash && <p className="px-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Preferencia guardada</p>}
      {error && <p className="px-1 text-[11px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}
