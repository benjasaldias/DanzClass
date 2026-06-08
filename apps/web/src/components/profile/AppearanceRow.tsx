'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fila "Apariencia" del bloque de Preferencias del perfil — alterna el tema
 * con un switch, replicando el estilo de SettingRow.
 */
export default function AppearanceRow() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface2"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lavanda-suave text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200">
        {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Apariencia</p>
        <p className="text-xs text-gray-400 dark:text-dark-text2">{isDark ? 'Modo oscuro' : 'Modo claro'}</p>
      </div>
      {/* switch */}
      <span
        className={cn(
          'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors',
          isDark ? 'bg-morado-flow' : 'bg-gray-300 dark:bg-dark-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            isDark ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}
