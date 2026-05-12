'use client'

import { cn } from '@/lib/utils'
import { DANCE_STYLES } from '@danceclass/shared'
import { Check } from 'lucide-react'

interface StylesPickerProps {
  label: string
  selected: string[]
  onChange: (styles: string[]) => void
  className?: string
}

export default function StylesPicker({ label, selected, onChange, className }: StylesPickerProps) {
  function toggle(style: string) {
    if (selected.includes(style)) {
      onChange(selected.filter((s) => s !== style))
    } else {
      onChange([...selected, style])
    }
  }

  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs font-normal text-brand-600">{selected.length} seleccionados</span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {DANCE_STYLES.map((style) => {
          const active = selected.includes(style)
          return (
            <button
              key={style}
              type="button"
              onClick={() => toggle(style)}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600'
              )}
            >
              {active && <Check className="h-3 w-3" />}
              {style}
            </button>
          )
        })}
      </div>
    </div>
  )
}
