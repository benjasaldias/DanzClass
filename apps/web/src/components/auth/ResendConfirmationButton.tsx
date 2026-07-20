'use client'

import { useEffect, useState } from 'react'
import { Loader2, MailCheck } from 'lucide-react'

// Botón "Reenviar correo de verificación" con cooldown local (item 4).
// Llama a /api/auth/resend-confirmation (rate-limited server-side). El cooldown
// de 60 s evita spam accidental; el rate-limit server-side (3/hora) es la
// defensa real contra abuso del SMTP.

const COOLDOWN_SECONDS = 60

export default function ResendConfirmationButton({
  email,
  className = '',
}: {
  email: string
  className?: string
}) {
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleResend() {
    if (sending || cooldown > 0 || !email) return
    setSending(true)
    try {
      await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSent(true)
      setCooldown(COOLDOWN_SECONDS)
    } catch {
      // silencioso — el usuario puede reintentar tras el cooldown
      setCooldown(COOLDOWN_SECONDS)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending || cooldown > 0}
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-300 hover:text-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MailCheck className="h-4 w-4" />
        )}
        {cooldown > 0
          ? `Reenviar en ${cooldown}s`
          : sent
          ? 'Reenviar de nuevo'
          : 'Reenviar correo de verificación'}
      </button>
      {sent && cooldown > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text2">
          Si tu cuenta existe y no está confirmada, te enviamos un nuevo correo. Revisa tu bandeja y spam.
        </p>
      )}
    </div>
  )
}
