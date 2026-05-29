'use client'

import { useState } from 'react'
import { Code2, Check } from 'lucide-react'

interface Props {
  username: string
  appUrl: string
}

export default function EmbedWidgetButton({ username, appUrl }: Props) {
  const [copied, setCopied] = useState(false)

  const embedUrl = `${appUrl}/embed/teacher/${username}`
  const iframeCode = `<iframe src="${embedUrl}" width="480" height="420" frameborder="0" style="border-radius:12px;border:1px solid #EEEDFE;" title="Clases de ${username}"></iframe>`

  function copy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
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
