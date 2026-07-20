'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { Copy, Check, Upload, FileImage, Loader2, CheckCircle2, ChevronLeft, Users, AlertTriangle, CreditCard, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { canPayByTransfer, paymentBreakdown, effectiveClassPrice, type SubscriptionTier } from '@danceclass/shared'

interface PaymentClientProps {
  enrollment: any
  currentUserId: string
  twoxRequest?: any
  tier: SubscriptionTier
  teacherMpConnected: boolean
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: 'Cuenta Corriente',
  cuenta_vista: 'Cuenta Vista',
  cuenta_rut: 'Cuenta RUT',
  cuenta_ahorro: 'Cuenta Ahorro',
}

const MP_ERRORS: Record<string, string> = {
  teacher_not_connected: 'Este profesor aún no tiene habilitado el pago in-app. Usa transferencia o inténtalo más tarde.',
  twox_not_supported: 'El pago in-app aún no está disponible para clases 2x. Usa transferencia.',
  invalid_amount: 'No pudimos calcular el monto. Contacta al profesor.',
  mp_error: 'No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo.',
}

export default function PaymentClient({ enrollment, currentUserId, twoxRequest, tier, teacherMpConnected }: PaymentClientProps) {
  const router = useRouter()
  const cls = enrollment.class
  const teacher = cls.teacher
  const paymentInfo = teacher.payment_info?.[0] ?? teacher.payment_info

  const is2x = !!enrollment.is_2x
  const missing2xPrice = is2x && !cls.price_2x
  // 2x usa su propio precio (sin descuento espontáneo); la clase individual sí
  // aplica el descuento activo del profesor (mismo cálculo que ClassDetailClient).
  const amount = is2x && cls.price_2x ? cls.price_2x : effectiveClassPrice(cls)
  const isMyTurnToPay = !is2x || !twoxRequest || twoxRequest.payment_assignee === currentUserId

  // Comisión / método de pago (marketplace). Para 2x mantenemos solo transferencia.
  const allowTransfer = canPayByTransfer(tier)
  const breakdown = paymentBreakdown(amount, tier)
  const showMp = teacherMpConnected && !is2x

  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)

  const alreadySubmitted = enrollment.status === 'payment_submitted'

  async function handleMpPay() {
    setMpLoading(true)
    setMpError(null)
    const res = await fetch('/api/mercadopago/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId: enrollment.id }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.init_point) {
      window.location.href = json.init_point
      return
    }
    setMpError(MP_ERRORS[json.error] ?? MP_ERRORS.mp_error)
    setMpLoading(false)
  }

  async function handleTransfer() {
    if (!twoxRequest) return
    setTransferring(true)
    await fetch('/api/class-2x/transfer-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: twoxRequest.id }),
    })
    setTransferring(false)
    router.refresh()
  }

  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    // Validate MIME type against magic bytes via FileReader
    const reader = new FileReader()
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer
      if (buf) {
        const bytes = new Uint8Array(buf.slice(0, 4))
        const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
        // Check magic bytes: JPEG=ffd8, PNG=89504e47, PDF=25504446, WEBP (via RIFF)=52494646
        const isJpeg = hex.startsWith('ffd8')
        const isPng = hex.startsWith('89504e47')
        const isPdf = hex.startsWith('25504446')
        const isWebp = hex.startsWith('52494646')
        if (!isJpeg && !isPng && !isPdf && !isWebp) {
          alert('Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP) o un PDF.')
          return
        }
      }
      if (!ALLOWED_MIME.includes(file.type)) {
        alert('Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP) o un PDF.')
        return
      }
      setReceipt(file)
      const preview = new FileReader()
      preview.onload = (ev) => setReceiptPreview(ev.target?.result as string)
      preview.readAsDataURL(file)
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10 MB
    disabled: alreadySubmitted,
  })

  async function copyToClipboard(text: string, field: string) {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  async function handleSubmit() {
    if (!receipt) return
    setUploading(true)

    const supabase = createClient()

    // Upload receipt to storage
    const ext = receipt.name.split('.').pop()
    const fileName = `${currentUserId}/${enrollment.id}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, receipt, { upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    // El bucket es privado: guardamos el path, no la URL pública (que dejó de existir).
    const receiptPath = uploadData.path

    const existingPayment = enrollment.payment?.[0] ?? enrollment.payment
    let paymentId: string | undefined = existingPayment?.id
    if (existingPayment?.id) {
      // Resubmission after a rejection — a new image means any previous AI
      // scan is stale, reset it so /api/payment/scan analyzes the new one.
      // También reseteamos los campos MP: esto es un pago por transferencia.
      await supabase.from('payments').update({
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
        commission_amount: 0,
        mp_payment_id: null,
        mp_status: null,
        scan_status: 'pending',
        scan_result: null,
        ai_verdict: 'none',
        confirmed_by: null,
        confirmed_at: null,
        operation_number: null,
      } as any).eq('id', existingPayment.id)
    } else {
      const { data: inserted } = await supabase.from('payments').insert({
        enrollment_id: enrollment.id,
        amount,
        receipt_url: receiptPath,
        status: 'pending',
        payment_method: 'transfer',
      } as any).select('id').single()
      paymentId = inserted?.id
    }

    // Update enrollment status + limpiar el hold temporal (item 3): al subir un
    // comprobante válido la reserva se concreta y deja de expirar.
    await supabase.from('enrollments').update({
      status: 'payment_submitted',
      hold_expires_at: null,
    } as any).eq('id', enrollment.id)

    // Best-effort: trigger the AI scan (only runs if the teacher opted in). Never
    // blocks the success screen — the teacher's manual review is the fallback.
    if (paymentId) {
      fetch('/api/payment/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      }).catch(() => {})
    }

    setSuccess(true)
    setUploading(false)

    setTimeout(() => router.push(`/class/${cls.id}`), 2500)
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-5">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-2">¡Comprobante enviado!</h2>
        <p className="text-gray-500 dark:text-dark-text2 text-sm">
          El profesor verificará tu pago pronto. Te avisaremos cuando confirme tu inscripción.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text">
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Pagar clase</h1>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-0.5">{cls.title}</p>
        {cls.type === 'entrenamiento' && cls.billing_day && (
          <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-1">Cobro mensual el día <strong>{cls.billing_day}</strong> de cada mes</p>
        )}
      </div>

      {missing2xPrice && (
        <div className="card p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-300">El profesor no configuró precio 2x</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
              Contacta al profesor — el monto que se muestra es el precio individual, no el 2x.
            </p>
          </div>
        </div>
      )}

      {/* Partner pays — this user is not the payment assignee */}
      {is2x && !isMyTurnToPay && (
        <div className="card p-5 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Tu compañer@ va a pagar</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">El monto 2x ({formatCLP(amount)}) está asignado a tu amig@.</p>
            </div>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400">Si quieres pagar tú, pídele a tu compañer@ que te transfiera el turno desde la página de la clase.</p>
        </div>
      )}

      {/* Amount — shown only when it's this user's turn */}
      {isMyTurnToPay && (
        <div className="card p-5 bg-brand-50 dark:bg-brand-950/30 border-brand-100 dark:border-brand-900/50">
          <p className="text-sm text-brand-700 dark:text-brand-300 font-medium mb-1">
            {breakdown.commission > 0 ? 'Total a pagar' : 'Monto a transferir'}
          </p>
          <p className="text-4xl font-bold text-brand-900 dark:text-brand-200">{formatCLP(breakdown.commission > 0 ? breakdown.total : amount)}</p>
          {breakdown.commission > 0 && (
            <div className="mt-2 space-y-0.5 text-xs text-brand-700 dark:text-brand-300">
              <div className="flex justify-between"><span>Clase</span><span>{formatCLP(breakdown.base)}</span></div>
              <div className="flex justify-between"><span>Comisión DanzClass (sin plan)</span><span>{formatCLP(breakdown.commission)}</span></div>
              <p className="text-[11px] text-brand-600/70 dark:text-brand-400/70 pt-1">
                Con un plan no pagas comisión. <Link href="/plans" className="underline font-medium">Ver planes</Link>
              </p>
            </div>
          )}
          {is2x && <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">Precio 2x — cubre a ambos</p>}
          <p className="text-xs text-brand-600/70 dark:text-brand-400/70 mt-1">
            El monto mostrado es el precio vigente al momento de pagar. Puede diferir del precio al inscribirse si el profesor aplicó un descuento posterior.
          </p>
        </div>
      )}

      {/* ── Opción Mercado Pago (in-app, con split) ─────────── */}
      {isMyTurnToPay && showMp && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#009EE3]" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Pagar con Mercado Pago</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-text2">
            Paga al instante con tarjeta, débito o saldo. Tu inscripción se confirma automáticamente al aprobarse el pago.
          </p>
          {mpError && <p className="text-xs text-red-600 dark:text-red-400">{mpError}</p>}
          <button
            onClick={handleMpPay}
            disabled={mpLoading}
            className="btn-primary w-full py-3 text-base justify-center disabled:opacity-60"
            style={{ backgroundColor: '#009EE3' }}
          >
            {mpLoading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Redirigiendo…</span>
            ) : (
              <>Pagar {formatCLP(breakdown.total)} con Mercado Pago</>
            )}
          </button>
        </div>
      )}

      {/* ── Opción Transferencia directa ────────────────────── */}
      {isMyTurnToPay && !allowTransfer ? (
        // Alumno sin plan: la transferencia directa queda bloqueada.
        <div className="card p-4 bg-gray-50 dark:bg-dark-surface2/60 border-dashed">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
            <h3 className="font-semibold text-sm text-gray-500 dark:text-dark-text2">Transferencia directa al profesor</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-text2">
            Disponible con un plan DanzClass. {showMp ? 'Sin plan, puedes pagar in-app con Mercado Pago (arriba).' : 'Obtén un plan para pagar por transferencia sin comisión.'}
          </p>
          <Link href="/plans" className="mt-3 inline-flex btn-secondary text-sm">Ver planes</Link>
        </div>
      ) : isMyTurnToPay && (
        // Alumno con plan (o flujo 2x): transferencia directa con comprobante.
        <>
          {showMp && (
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-dark-text2">
              <span className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
              o transfiere directo
              <span className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
            </div>
          )}

          {paymentInfo ? (
            <div className="card p-4 space-y-3">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Datos de transferencia</h3>

              {[
                { label: 'Banco', value: paymentInfo.bank_name },
                { label: 'Tipo de cuenta', value: ACCOUNT_TYPE_LABELS[paymentInfo.account_type] ?? paymentInfo.account_type },
                { label: 'Número de cuenta', value: paymentInfo.account_number, copyable: true },
                { label: 'RUT', value: paymentInfo.rut, copyable: true },
                { label: 'Titular', value: paymentInfo.account_holder_name },
                { label: 'Email', value: paymentInfo.email, copyable: true },
              ].map(({ label, value, copyable }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-text2">{label}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{value}</p>
                  </div>
                  {copyable && (
                    <button
                      onClick={() => copyToClipboard(value, label)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 text-gray-500 dark:text-dark-text2 flex-shrink-0"
                    >
                      {copiedField === label
                        ? <Check className="h-4 w-4 text-green-600" />
                        : <Copy className="h-4 w-4" />
                      }
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-4 text-center text-sm text-gray-500 dark:text-dark-text2">
              El profesor aún no ha configurado sus datos bancarios. Contáctalo directamente.
            </div>
          )}

          {/* Receipt upload + submit */}
          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text mb-2">
              {alreadySubmitted ? 'Comprobante enviado' : 'Sube el comprobante de pago'}
            </h3>

            {alreadySubmitted ? (
              <div className="card p-4 flex items-center gap-3 bg-blue-50 border-blue-100">
                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-700">Tu comprobante fue enviado. El profesor lo está revisando.</p>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={cn(
                  'relative rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                  isDragActive ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30' : 'border-gray-200 dark:border-dark-border hover:border-brand-300 hover:bg-gray-50 dark:hover:bg-dark-surface',
                  receipt && 'border-green-400 bg-green-50 dark:bg-green-950/20'
                )}
              >
                <input {...getInputProps()} />

                {receiptPreview ? (
                  <div className="space-y-2">
                    {receipt?.type.startsWith('image/') ? (
                      <img src={receiptPreview} alt="Comprobante" className="mx-auto max-h-48 rounded-xl object-contain" />
                    ) : (
                      <div className="flex items-center gap-3 justify-center">
                        <FileImage className="h-8 w-8 text-gray-400 dark:text-dark-text2" />
                        <p className="text-sm font-medium text-gray-700 dark:text-dark-text2">{receipt?.name}</p>
                      </div>
                    )}
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium">✓ Archivo listo para enviar</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text2">Haz clic para cambiar</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 text-gray-300 dark:text-dark-border mx-auto" />
                    <p className="text-sm font-medium text-gray-700 dark:text-dark-text2">
                      {isDragActive ? 'Suelta aquí' : 'Arrastra o haz clic para subir'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-dark-text2">JPG, PNG o PDF · Máx 10 MB</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {!alreadySubmitted && (
            <button
              onClick={handleSubmit}
              disabled={!receipt || uploading}
              className="btn-primary w-full py-3 text-base"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : 'Enviar comprobante'}
            </button>
          )}

          {/* Transfer payment to partner (2x) */}
          {is2x && !alreadySubmitted && twoxRequest && (
            <button
              onClick={handleTransfer}
              disabled={transferring}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-dark-border py-3 text-sm font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors disabled:opacity-50"
            >
              {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Que pague mi compañer@
            </button>
          )}
        </>
      )}

      {/* Sin plan y profesor sin MP conectado: no hay vía de pago disponible. */}
      {isMyTurnToPay && !allowTransfer && !showMp && (
        <div className="card p-4 bg-coral-fuego/10 border border-coral-fuego/30">
          <p className="text-sm text-gray-700 dark:text-dark-text">
            Este profesor aún no acepta pagos in-app y la transferencia directa requiere un plan.
            Obtén un plan para inscribirte, o vuelve más tarde.
          </p>
        </div>
      )}
    </div>
  )
}
