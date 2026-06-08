'use client'

import { useState } from 'react'
import { Code2, Check } from 'lucide-react'

interface Props {
  username: string
  appUrl: string
  asRow?: boolean
}

export default function EmbedWidgetButton({ username, appUrl, asRow }: Props) {
  const [copied, setCopied] = useState(false)

  const embedUrl = `${appUrl}/embed/teacher/${username}`
  const iframeCode = `<iframe src="${embedUrl}" width="480" height="420" frameborder="0" style="border-radius:12px;border:1px solid #EEEDFE;" title="Clases de ${username}"></iframe>`

  function copy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  if (asRow) {
    return (
      <button
        onClick={copy}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface2"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lavanda-suave text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200">
          {copied ? <Check className="h-[18px] w-[18px] text-emerald-500" /> : <Code2 className="h-[18px] w-[18px]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Widget para tu web</p>
          <p className="text-xs text-gray-400 dark:text-dark-text2">{copied ? '¡Código copiado!' : 'Copia el código del iframe'}</p>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-brand-400 dark:hover:border-brand-400 hover:text-brand-700 transition-colors"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Code2 className="h-4 w-4" />}
      {copied ? '¡Copiado!' : 'Widget para tu web'}
    </button>
  )
}
