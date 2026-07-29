'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { Copy, Check, Upload, FileImage, Loader2, CheckCircle2, ChevronLeft, Users, AlertTriangle, CreditCard, Building2, CalendarClock, QrCode } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  paymentBreakdown, effectiveClassPrice, twoxClassPrice, formatBillingPeriod,
  detectReceiptType, RECEIPT_ALLOWED_MIME, RECEIPT_MAGIC_BYTES,
  type SubscriptionTier, type DebtSummary, type MonthlyCharge, type ReceiptFileType,
} from '@danceclass/shared'

interface PaymentClientProps {
  enrollment: any
  currentUserId: string
  twoxRequest?: any
  tier: SubscriptionTier
  teacherMpConnected: boolean
  /** Deuda mensual acumulada — sólo en entrenamientos (audit.md S4). */
  debt?: DebtSummary | null
}

const CHARGE_PILL: Record<string, { label: string; className: string }> = {
  due: { label: 'Por pagar', className: 'bg-coral-fuego/10 text-coral-fuego border-coral-fuego/30' },
  rejected: { label: 'Rechazado', className: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' },
  pending: { label: 'En revisión', className: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
  verified: { label: 'Pagado', className: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' },
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: 'Cuenta Corriente',
  cuenta_vista: 'Cuenta Vista',
  cuenta_rut: 'Cuenta RUT',
  cuenta_ahorro: 'Cuenta Ahorro',
}

const MP_ERRORS: Record<string, string> = {
  teacher_not_connected: 'Este profesor aún no tiene habilitado el pago in-app. Usa transferencia o inténtalo más tarde.',
  mp_not_accepted_for_class: 'Esta clase no acepta pago con Mercado Pago. Usa transferencia.',
  not_payment_turn: 'El turno de pago es de tu compañer@. Pídele que te lo transfiera desde la página de la clase.',
  twox_not_matched: 'No encontramos tu emparejamiento 2x activo. Vuelve a la clase e inténtalo de nuevo.',
  twox_price_missing: 'El profesor no configuró el precio 2x de esta clase. Contáctalo antes de pagar.',
  invalid_amount: 'No pudimos calcular el monto. Contacta al profesor.',
  mp_error: 'No pudimos iniciar el pago con Mercado Pago. Intenta de nuevo.',
}

export default function PaymentClient({ enrollment, currentUserId, twoxRequest, tier, teacherMpConnected, debt }: PaymentClientProps) {
  const router = useRouter()
  const cls = enrollment.class
  const teacher = cls.teacher
  const paymentInfo = teacher.payment_info?.[0] ?? teacher.payment_info

  const is2x = !!enrollment.is_2x
  // 2x usa su propio precio (sin descuento espontáneo), con la precedencia
  // price_2x ?? price_suelta_2x; la clase individual sí aplica el descuento
  // activo del profesor (mismo cálculo que ClassDetailClient).
  const twoxPrice = is2x ? twoxClassPrice(cls) : null
  const missing2xPrice = is2x && twoxPrice === null
  const isMyTurnToPay = !is2x || !twoxRequest || twoxRequest.payment_assignee === currentUserId

  // ── Entrenamiento: se paga por MES, no una vez ────────────────────────────
  // El monto deja de ser "el precio de la clase" y pasa a ser la suma de los
  // meses que el alumno elige saldar. Cada cargo conserva el monto con que se
  // emitió, así que un mes viejo no se reprecia si el profesor sube el precio.
  const debtMode = !!debt
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!debt) return []
    // Por defecto, todo lo vencido (que es lo que le devuelve el acceso por QR);
    // si no hay nada vencido, el mes más antiguo pendiente.
    if (debt.overdue.length > 0) return debt.overdue.map((c) => c.id)
    return debt.oldestUnpaid ? [debt.oldestUnpaid.id] : []
  })
  const selectedCharges: MonthlyCharge[] = debt
    ? debt.unpaid.filter((c) => selectedIds.includes(c.id))
    : []
  const debtAmount = selectedCharges.reduce((acc, c) => acc + c.amount, 0)

  const amount = debtMode ? debtAmount : (twoxPrice ?? effectiveClassPrice(cls))
  const nothingToPay = debtMode && debt!.unpaid.length === 0

  function toggleCharge(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Método de pago: lo decide el PROFESOR por clase (accepts_mp/accepts_transfer),
  // no el plan del alumno. MP además exige que el profesor tenga la cuenta
  // conectada por OAuth. El plan solo cambia el precio (comisión de servicio).
  const acceptsMp = cls.accepts_mp !== false
  const acceptsTransfer = cls.accepts_transfer !== false
  const canPayNow = !nothingToPay && (!debtMode || selectedCharges.length > 0)
  const showMp = acceptsMp && teacherMpConnected && isMyTurnToPay && canPayNow
  const showTransfer = acceptsTransfer && isMyTurnToPay && canPayNow
  const noMethodAvailable =
    isMyTurnToPay && !nothingToPay && !(acceptsMp && teacherMpConnected) && !acceptsTransfer
  // Mercado Pago cubre UN mes por checkout: el `marketplace_fee` y la validación
  // de monto del webhook se calculan contra una sola fila de `payments`.
  const mpNeedsSingleMonth = debtMode && selectedCharges.length > 1

  // MP cobra UN cargo: el desglose se calcula sobre esa mensualidad, no sobre
  // la suma de las seleccionadas (que sí es el total de la transferencia).
  const mpAmount = debtMode ? (selectedCharges[0]?.amount ?? 0) : amount
  const mpBreakdown = paymentBreakdown(mpAmount, tier, 'mp')

  const [receipt, setReceipt] = useState<File | null>(null)
  // Tipo REAL del archivo (por magic bytes), no el que dice su nombre: es el que
  // decide la extensión y el content-type con que se guarda (D-4).
  const [receiptType, setReceiptType] = useState<ReceiptFileType | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)

  // En un entrenamiento el estado de la inscripción no dice nada sobre el mes
  // en curso (puede estar `confirmed` desde hace un año y deber marzo): lo que
  // manda es el estado de cada cargo, que la lista de mensualidades ya muestra.
  const alreadySubmitted = !debtMode && enrollment.status === 'payment_submitted'

  async function handleMpPay() {
    setMpLoading(true)
    setMpError(null)
    const res = await fetch('/api/mercadopago/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId: enrollment.id,
        ...(debtMode && selectedCharges[0] ? { chargeId: selectedCharges[0].id } : {}),
      }),
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    // El tipo se decide por el CONTENIDO (magic bytes), no por el nombre ni por
    // el MIME que declara el navegador: los dos los controla quien sube.
    const reader = new FileReader()
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer
      const detected = buf ? detectReceiptType(new Uint8Array(buf.slice(0, RECEIPT_MAGIC_BYTES))) : null
      if (!detected || !RECEIPT_ALLOWED_MIME.includes(file.type)) {
        alert('Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP) o un PDF.')
        return
      }
      setReceipt(file)
      setReceiptType(detected)
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
    if (!receipt || !receiptType) return
    setUploading(true)

    const supabase = createClient()

    // Extensión y content-type derivados del tipo VALIDADO (D-4). Tomarlos del
    // nombre del archivo dejaba guardar un PNG como `.svg`, que el navegador
    // puede interpretar como SVG —con script— al abrir la URL firmada.
    // En un entrenamiento hay un comprobante por (grupo de) mes(es): reusar
    // `<enrollment>.<ext>` sobrescribiría el comprobante del mes anterior, que
    // el profesor todavía puede necesitar consultar.
    const suffix = debtMode && selectedCharges[0] ? `-${selectedCharges[0].billing_period}` : ''
    const fileName = `${currentUserId}/${enrollment.id}${suffix}.${receiptType.ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, receipt, { upsert: true, contentType: receiptType.mime })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    // El bucket es privado: guardamos el path, no la URL pública (que dejó de existir).
    const receiptPath = uploadData.path

    // El registro del pago (insert/update en `payments` + `enrollments`) es
    // server-side: valida `accepts_transfer` y calcula el monto de forma
    // autoritativa, en vez de confiar en el cliente (ver /api/payment/submit-transfer).
    const submitRes = await fetch('/api/payment/submit-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId: enrollment.id,
        receiptPath,
        ...(debtMode ? { chargeIds: selectedIds } : {}),
      }),
    })

    if (!submitRes.ok) {
      console.error('submit-transfer error:', await submitRes.json().catch(() => ({})))
      setUploading(false)
      return
    }

    setSuccess(true)
    setUploading(false)

    // En un entrenamiento pueden quedar meses por pagar: se recarga la pantalla
    // en vez de mandar al alumno a la clase.
    setTimeout(() => (debtMode ? router.refresh() : router.push(`/class/${cls.id}`)), 2500)
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-5">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-2">¡Comprobante enviado!</h2>
        <p className="text-gray-500 dark:text-dark-text2 text-sm">
          {debtMode
            ? 'El profesor verificará tu pago pronto. Mientras tanto tu acceso por QR sigue habilitado.'
            : 'El profesor verificará tu pago pronto. Te avisaremos cuando confirme tu inscripción.'}
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

      {/* ── Entrenamiento: mensualidades ──────────────────────────── */}
      {debtMode && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Mensualidades</h3>
          </div>

          {debt!.charges.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-dark-text2">
              Todavía no hay mensualidades emitidas para tu inscripción.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-dark-border">
              {debt!.charges.map((c) => {
                const pill = CHARGE_PILL[c.status] ?? CHARGE_PILL.due
                const selectable = c.status === 'due' || c.status === 'rejected'
                const checked = selectedIds.includes(c.id)
                const overdue = debt!.overdue.some((o) => o.id === c.id)
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCharge(c.id)}
                        aria-label={`Pagar ${formatBillingPeriod(c.billing_period)}`}
                        className="h-4 w-4 rounded border-gray-300 dark:border-dark-border text-brand-600 focus:ring-brand-500"
                      />
                    ) : (
                      <span className="h-4 w-4 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text">
                        {formatBillingPeriod(c.billing_period)}
                      </p>
                      {overdue && (
                        <p className="text-xs text-coral-fuego">Vencida — bloquea tu QR de acceso</p>
                      )}
                      {c.offline_confirmed && c.status === 'verified' && (
                        <p className="text-xs text-gray-500 dark:text-dark-text2">Registrada por el profesor</p>
                      )}
                    </div>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', pill.className)}>
                      {pill.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-dark-text whitespace-nowrap">
                      {formatCLP(c.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {debt!.hasOverdue && (
            <div className="flex items-start gap-2 rounded-xl bg-coral-fuego/10 border border-coral-fuego/30 p-3">
              <QrCode className="h-4 w-4 text-coral-fuego flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-700 dark:text-dark-text">
                Tienes {debt!.overdue.length === 1 ? 'un mes vencido' : `${debt!.overdue.length} meses vencidos`}.
                Tu cupo sigue siendo tuyo, pero tu QR de acceso no funciona hasta que te pongas al día.
              </p>
            </div>
          )}

          {debt!.totalInReview > 0 && (
            <p className="text-xs text-gray-500 dark:text-dark-text2">
              {formatCLP(debt!.totalInReview)} esperando revisión del profesor.
            </p>
          )}

          {nothingToPay ? (
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Estás al día. No hay mensualidades pendientes.
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-dark-text2">
              Puedes pagar varios meses con una sola transferencia: marca los que quieras saldar.
            </p>
          )}
        </div>
      )}

      {/* Precio de la clase — lo que recibe el profesor, sea cual sea el método */}
      {isMyTurnToPay && !nothingToPay && (
        <div className="card p-5 bg-brand-50 dark:bg-brand-950/30 border-brand-100 dark:border-brand-900/50">
          <p className="text-sm text-brand-700 dark:text-brand-300 font-medium mb-1">
            {debtMode
              ? selectedCharges.length === 1 ? 'Mensualidad seleccionada' : `${selectedCharges.length} mensualidades seleccionadas`
              : 'Precio de la clase'}
          </p>
          <p className="text-4xl font-bold text-brand-900 dark:text-brand-200">{formatCLP(amount)}</p>
          {debtMode && selectedCharges.length > 0 && (
            <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">
              {selectedCharges.map((c) => formatBillingPeriod(c.billing_period)).join(' · ')}
            </p>
          )}
          {is2x && <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">Precio 2x — cubre a ambos</p>}
          {showMp && showTransfer && (
            <p className="text-xs text-brand-700 dark:text-brand-300 mt-2">
              Elige cómo pagar más abajo. El monto final varía según el método.
            </p>
          )}
          <p className="text-xs text-brand-600/70 dark:text-brand-400/70 mt-1">
            {debtMode
              ? 'Cada mensualidad conserva el monto con que se emitió: un cambio de precio no altera los meses ya cobrados.'
              : 'El monto mostrado es el precio vigente al momento de pagar. Puede diferir del precio al inscribirse si el profesor aplicó un descuento posterior.'}
          </p>
        </div>
      )}

      {/* ── Opción Mercado Pago (in-app, con split) ─────────── */}
      {showMp && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#009EE3]" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Pagar con Mercado Pago</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-text2">
            Paga al instante con tarjeta, débito o saldo. Tu inscripción se confirma automáticamente al aprobarse el pago.
          </p>

          <div className="space-y-0.5 text-xs text-gray-600 dark:text-dark-text2 border-t border-gray-100 dark:border-dark-border pt-2">
            <div className="flex justify-between">
              <span>{debtMode && selectedCharges[0] ? formatBillingPeriod(selectedCharges[0].billing_period) : 'Clase'}</span>
              <span>{formatCLP(mpBreakdown.base)}</span>
            </div>
            {mpBreakdown.commission > 0 && (
              <div className="flex justify-between"><span>Comisión de servicio DanzClass</span><span>{formatCLP(mpBreakdown.commission)}</span></div>
            )}
            <div className="flex justify-between"><span>Costo de procesamiento Mercado Pago</span><span>{formatCLP(mpBreakdown.mpFeeCovered)}</span></div>
            <div className="flex justify-between font-semibold text-gray-900 dark:text-dark-text pt-1">
              <span>Total</span><span>{formatCLP(mpBreakdown.total)}</span>
            </div>
            {mpBreakdown.commission > 0 && (
              <p className="text-[11px] text-gray-500 dark:text-dark-text2 pt-1">
                Con un plan no pagas la comisión de servicio de DanzClass (el costo de procesamiento de Mercado Pago se mantiene). <Link href="/plans" className="underline font-medium">Ver planes</Link>
              </p>
            )}
          </div>

          {mpNeedsSingleMonth && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              Mercado Pago cubre un mes por vez. Deja marcada una sola mensualidad, o paga los
              {' '}{selectedCharges.length} meses juntos por transferencia.
            </p>
          )}
          {mpError && <p className="text-xs text-red-600 dark:text-red-400">{mpError}</p>}
          <button
            onClick={handleMpPay}
            disabled={mpLoading || mpNeedsSingleMonth}
            className="btn-primary w-full py-3 text-base justify-center disabled:opacity-60"
            style={{ backgroundColor: '#009EE3' }}
          >
            {mpLoading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Redirigiendo…</span>
            ) : (
              <>Pagar {formatCLP(mpBreakdown.total)} con Mercado Pago</>
            )}
          </button>
        </div>
      )}

      {/* ── Opción Transferencia directa ────────────────────── */}
      {showTransfer && (
        <>
          {showMp && (
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-dark-text2">
              <span className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
              o transfiere directo
              <span className="h-px flex-1 bg-gray-200 dark:bg-dark-border" />
            </div>
          )}

          <div className="card p-4 flex items-center justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Transferir al profesor</p>
                <p className="text-xs text-gray-600 dark:text-dark-text2">Sin cargos adicionales. El profesor confirma tu pago.</p>
              </div>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-dark-text whitespace-nowrap">{formatCLP(amount)}</p>
          </div>

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

        </>
      )}

      {/* Ceder el turno de pago al compañer@ (2x) — independiente del método */}
      {isMyTurnToPay && is2x && !alreadySubmitted && twoxRequest && (
        <button
          onClick={handleTransfer}
          disabled={transferring}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-dark-border py-3 text-sm font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors disabled:opacity-50"
        >
          {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          Que pague mi compañer@
        </button>
      )}

      {/* La clase acepta MP pero el profesor no conectó su cuenta, y no acepta
          transferencia: no queda ninguna vía de pago disponible. */}
      {noMethodAvailable && (
        <div className="card p-4 bg-coral-fuego/10 border border-coral-fuego/30">
          <p className="text-sm text-gray-700 dark:text-dark-text">
            Esta clase no tiene ninguna forma de pago disponible en este momento
            {acceptsMp && !teacherMpConnected ? ' (el profesor todavía no habilitó el pago con Mercado Pago)' : ''}.
            Contacta al profesor o vuelve más tarde.
          </p>
        </div>
      )}
    </div>
  )
}
