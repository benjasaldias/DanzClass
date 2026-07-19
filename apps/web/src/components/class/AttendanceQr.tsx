'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

// QR de asistencia del alumno (paridad con el mobile). Solo se monta cuando el
// enrollment está confirmado. El token se lee client-side vía RLS
// (qr_tokens_select_own → el alumno solo ve el suyo); no se expone en props
// server-side. Estados: cargando · generando (aún sin fila) · revocado · activo.
export default function AttendanceQr({ enrollmentId, classData }: { enrollmentId: string; classData: any }) {
  const [state, setState] = useState<'loading' | 'active' | 'revoked' | 'none'>('loading')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await (supabase as any)
        .from('qr_tokens')
        .select('token, status')
        .eq('enrollment_id', enrollmentId)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setState('none'); return }
      setToken(data.token)
      setState(data.status === 'revoked' ? 'revoked' : 'active')
    })()
    return () => { cancelled = true }
  }, [enrollmentId])

  if (state === 'loading' || state === 'none') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs opacity-80">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Generando tu código QR…
      </div>
    )
  }

  if (state === 'revoked') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        Tu código QR fue revocado. Contacta al profesor si crees que es un error.
      </div>
    )
  }

  const dateLabel = classData?.type === 'suelta'
    ? `Válido el ${formatDate(classData.date)}`
    : classData?.recurrence === 'custom'
      ? 'Válido en las fechas programadas'
      : 'Válido en cada sesión de esta clase'

  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-brand-100 bg-white p-4 dark:border-dark-border dark:bg-dark-surface2">
      <p className="text-xs font-semibold text-gray-700 dark:text-dark-text2">Tu código de asistencia</p>
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={token!} size={168} bgColor="#ffffff" fgColor="#1A1035" level="M" />
      </div>
      <p className="text-center text-xs text-gray-500 dark:text-dark-text2">
        Muéstraselo al profesor al llegar. {dateLabel}.
      </p>
    </div>
  )
}
