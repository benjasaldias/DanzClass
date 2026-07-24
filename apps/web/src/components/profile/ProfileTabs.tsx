'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export type ProfileTab = {
  key: string
  label: string
  content: React.ReactNode
}

/**
 * Segmented control para /profile (Plan B).
 * El contenido de cada pestaña se renderiza en el server component y se pasa
 * como prop (React node), por lo que los client components anidados
 * (AiScanPreferenceCard, LogoutButton, etc.) siguen siendo interactivos.
 * La pestaña activa se persiste en el query param `?tab=` vía history.replaceState
 * (sin re-navegar) para sobrevivir a idas/vueltas a /financiero, /chats, etc.
 */
export default function ProfileTabs({
  tabs,
  initialTab,
}: {
  tabs: ProfileTab[]
  initialTab?: string
}) {
  const validInitial = tabs.some((t) => t.key === initialTab) ? initialTab! : tabs[0].key
  const [active, setActive] = useState(validInitial)

  function selectTab(key: string) {
    setActive(key)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', key)
      window.history.replaceState(null, '', url.toString())
    }
  }

  const activeContent = tabs.find((t) => t.key === active)?.content

  return (
    <>
      {/* Segmented control — texto + subrayado, liviano para no competir con el BottomNav */}
      <div className="sticky top-14 z-20 flex border-b border-gray-100 bg-white/90 backdrop-blur dark:border-dark-border dark:bg-dark-surface/90">
        {tabs.map((t) => {
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={cn(
                'relative flex-1 px-2 py-3 text-sm font-semibold transition-colors',
                isActive
                  ? 'text-brand-600 dark:text-brand-300'
                  : 'text-gray-400 hover:text-gray-600 dark:text-dark-text2 dark:hover:text-dark-text',
              )}
            >
              {t.label}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-600 dark:bg-brand-300" />
              )}
            </button>
          )
        })}
      </div>

      <div className="min-h-[40vh]">{activeContent}</div>
    </>
  )
}
