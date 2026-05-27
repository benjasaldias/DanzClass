'use client'

import { useState, useEffect } from 'react'
import { X, Bug } from 'lucide-react'

const STORAGE_KEY = 'alpha_banner_dismissed'

export default function AlphaBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = sessionStorage.getItem(STORAGE_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed top-14 left-0 right-0 z-30 flex items-center justify-center gap-2 bg-violet-600/90 dark:bg-violet-900/90 backdrop-blur-sm px-4 py-1.5 text-xs text-white">
      <Bug className="h-3 w-3 flex-shrink-0" />
      <span>Versión alpha — ¿Encontraste algo raro?</span>
      <a
        href="mailto:contacto@danzclass.com?subject=Bug%20DanzClass"
        className="underline font-semibold hover:text-violet-200"
      >
        Reportar
      </a>
      <button
        onClick={dismiss}
        className="ml-auto p-0.5 hover:text-violet-200"
        aria-label="Cerrar"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
