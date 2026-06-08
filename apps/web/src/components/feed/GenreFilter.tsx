'use client'

import { useState } from 'react'
import { ChevronDown, X, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, styleColor } from '@danceclass/shared'

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
            : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text2 border-gray-200 dark:border-dark-border hover:border-brand-400'
        )}
      >
        {selected
          ? <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }} />
          : <Music2 className="h-3.5 w-3.5" />}
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
          <div className="absolute left-0 top-full mt-2 z-50 w-72 rounded-2xl bg-white dark:bg-dark-surface2 border border-gray-100 dark:border-dark-border shadow-xl p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-dark-text2 uppercase tracking-wider mb-3">Estilos de baile</p>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {DANCE_STYLES.map((style) => {
                const isSel = selected === style
                const dot = styleColor(style).gradB
                return (
                  <button
                    key={style}
                    onClick={() => select(style)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                      isSel
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-gray-50 dark:bg-dark-surface text-gray-700 dark:text-dark-text2 border-gray-200 dark:border-dark-border hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300'
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.9)' : dot }}
                    />
                    {style}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
