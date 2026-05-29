'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function ReferralCopyButton({ code, appUrl }: { code: string; appUrl: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${appUrl}/auth/register?ref=${code}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-dark-surface2 border border-violet-200 dark:border-dark-border px-3 py-2">
        <span className="flex-1 text-xs text-gray-500 dark:text-dark-text2 truncate font-mono">{link}</span>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 transition-colors"
        >
          {copied
            ? <><Check className="h-3.5 w-3.5" /> Copiado</>
            : <><Copy className="h-3.5 w-3.5" /> Copiar</>
          }
        </button>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-dark-text2">
        Tu código: <span className="font-bold text-gray-600 dark:text-dark-text">{code}</span>
      </p>
    </div>
  )
}
