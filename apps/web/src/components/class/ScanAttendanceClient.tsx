'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronLeft, CheckCircle2, AlertCircle, Camera } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'

// El resultado se muestra 2s antes de re-habilitar el escaneo — tiempo para
// leer el nombre sin frenar la fila. Paridad con el escáner mobile.
const RESULT_DISPLAY_MS = 2000

type ScanOutcome =
  | { kind: 'confirmed'; studentName: string; avatarUrl: string | null }
  | { kind: 'already_registered'; studentName: string; avatarUrl: string | null }
  | { kind: 'rejected'; message: string; reason?: string }
  | { kind: 'network_error' }

type CamState = 'starting' | 'scanning' | 'denied' | 'error'

export default function ScanAttendanceClient({ classId, classTitle }: { classId: string; classTitle: string }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  // Ref (no state) para bloquear sincrónicamente lecturas repetidas del mismo
  // QR mientras se valida/se muestra el resultado — evita doble check-in.
  const scanLockRef = useRef(false)
  const [camState, setCamState] = useState<CamState>('starting')
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [checking, setChecking] = useState(false)

  // Cierra el resultado y re-habilita el escaneo.
  const dismissOutcome = useCallback(() => {
    setOutcome(null)
    scanLockRef.current = false
  }, [])

  const validate = useCallback(async (token: string) => {
    setChecking(true)
    // Un rechazo ACCIONABLE (pago pendiente) no se auto-cierra: el profesor
    // necesita tiempo para decidir. El resto sigue con el flash de 2s (P3-4).
    let holdOpen = false
    try {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) {
        setOutcome({ kind: 'network_error' })
      } else if (json.status === 'confirmed') {
        setOutcome({ kind: 'confirmed', studentName: json.student?.full_name ?? 'Alumno', avatarUrl: json.student?.avatar_url ?? null })
      } else if (json.status === 'already_registered') {
        setOutcome({ kind: 'already_registered', studentName: json.student?.full_name ?? 'Alumno', avatarUrl: json.student?.avatar_url ?? null })
      } else {
        const reason = json.reason as string | undefined
        holdOpen = reason === 'payment_not_confirmed'
        setOutcome({ kind: 'rejected', message: json.message ?? 'QR rechazado.', reason })
      }
    } catch {
      setOutcome({ kind: 'network_error' })
    } finally {
      setChecking(false)
      // navigator.vibrate no está en Safari iOS; es best-effort.
      try { navigator.vibrate?.(100) } catch {}
      if (!holdOpen) {
        setTimeout(() => {
          setOutcome(null)
          scanLockRef.current = false
        }, RESULT_DISPLAY_MS)
      }
    }
  }, [])

  useEffect(() => {
    let disposed = false
    ;(async () => {
      try {
        // Import dinámico: mantiene ZXing fuera del bundle inicial y del SSR.
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current!,
          (result) => {
            if (!result || scanLockRef.current) return
            scanLockRef.current = true
            validate(result.getText())
          }
        )
        if (disposed) { controls.stop(); return }
        controlsRef.current = controls
        setCamState('scanning')
      } catch (err: any) {
        const name = err?.name ?? ''
        setCamState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
      }
    })()
    return () => {
      disposed = true
      controlsRef.current?.stop()
    }
  }, [validate])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.push(`/class/${classId}`)} className="text-white" aria-label="Volver">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="flex-1 truncate text-base font-bold text-white">Escanear — {classTitle}</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* video siempre montado para que el ref exista al iniciar el lector */}
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {(camState === 'denied' || camState === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8">
            <Camera className="h-10 w-10 text-dark-text2" />
            <p className="text-center font-semibold text-white">
              {camState === 'denied'
                ? 'No pudimos acceder a la cámara'
                : 'No se pudo iniciar la cámara'}
            </p>
            <p className="text-center text-sm text-dark-text2">
              {camState === 'denied'
                ? 'Habilita el permiso de cámara para este sitio en tu navegador y recarga la página.'
                : 'Verifica que tu dispositivo tenga cámara y que ningún otro programa la esté usando.'}
            </p>
          </div>
        )}

        {camState === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
          </div>
        )}

        {camState === 'scanning' && !outcome && !checking && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="h-64 w-64 rounded-3xl border-4 border-white/70" />
            <span className="mt-6 rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white">
              Apunta al QR del alumno
            </span>
          </div>
        )}

        {checking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
          </div>
        )}

        {outcome && (
          <ResultOverlay
            outcome={outcome}
            onDismiss={dismissOutcome}
            onReviewPayments={() => router.push('/my-classes')}
          />
        )}
      </div>
    </div>
  )
}

function ResultOverlay({
  outcome,
  onDismiss,
  onReviewPayments,
}: {
  outcome: ScanOutcome
  onDismiss: () => void
  onReviewPayments: () => void
}) {
  const bg = {
    confirmed: 'bg-green-600',
    already_registered: 'bg-amber-500',
    rejected: 'bg-red-600',
    network_error: 'bg-red-600',
  }[outcome.kind]

  const avatarUrl = 'avatarUrl' in outcome ? outcome.avatarUrl : null
  const pendingPayment = outcome.kind === 'rejected' && outcome.reason === 'payment_not_confirmed'

  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 ${bg}`}>
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" width={80} height={80} className="mb-3 h-20 w-20 rounded-full border-2 border-white object-cover" />
      ) : outcome.kind === 'confirmed' ? (
        <CheckCircle2 className="mb-3 h-12 w-12 text-white" />
      ) : (
        <AlertCircle className="mb-3 h-12 w-12 text-white" />
      )}
      <p className="text-center text-2xl font-bold text-white">
        {outcome.kind === 'confirmed' && `Confirmado — ${outcome.studentName}`}
        {outcome.kind === 'already_registered' && `Ya registrado — ${outcome.studentName}`}
        {outcome.kind === 'rejected' && outcome.message}
        {outcome.kind === 'network_error' && 'No se pudo validar. Intenta de nuevo.'}
      </p>

      {/* P3-4: el pago pendiente es el único rechazo que el profesor puede
          resolver ahí mismo. En vez de un flash rojo de 2s, damos salida:
          confirmar el pago, o seguir la fila y resolverlo después. */}
      {pendingPayment && (
        <>
          <p className="mt-2 max-w-xs text-center text-sm text-white/90">
            Confirma su pago para habilitar el QR, o déjalo pasar y resuélvelo después.
          </p>
          <div className="mt-5 flex flex-col items-stretch gap-2">
            <button
              onClick={onReviewPayments}
              className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-red-700"
            >
              Revisar pagos
            </button>
            <button
              onClick={onDismiss}
              className="rounded-xl border border-white/60 px-6 py-2.5 text-sm font-semibold text-white"
            >
              Seguir escaneando
            </button>
          </div>
        </>
      )}
    </div>
  )
}
