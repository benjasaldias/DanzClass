'use client'

import { useState } from 'react'
import { ChevronDown, X, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DANCE_STYLES } from '@danceclass/shared'

interface GenreFilterProps {
  selected: string
  onChange: (style: string) => void
}

export default function GenreFilter({ selected, onChange }: GenreFilterProps) {
  const [open, setOpen] = useState(false)

  function select(style: string) {
    onChange(selected === style ? '' : style)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors border',
          selected
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-400'
        )}
      >
        <Music2 className="h-3.5 w-3.5" />
        {selected || 'Géneros'}
        {selected
          ? <X className="h-3.5 w-3.5" onClick={(e) => { e.stopPropagation(); onChange('') }} />
          : <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        }
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="absolute left-0 top-full mt-2 z-50 w-72 rounded-2xl bg-white border border-gray-100 shadow-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Estilos de baile</p>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {DANCE_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => select(style)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                    selected === style
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-brand-400 hover:text-brand-600'
                  )}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
