'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, CheckCircle2, XCircle, AlertTriangle, Sparkles,
  RotateCcw, ExternalLink, Loader2, FileText,
} from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatCLP, formatDate } from '@/lib/utils'

interface PaymentReviewClientProps {
  payment: any
}

function isPdfPath(path: string | null): boolean {
  return !!path && path.toLowerCase().split('?')[0].endsWith('.pdf')
}

export default function PaymentReviewClient({ payment: initialPayment }: PaymentReviewClientProps) {
  const router = useRouter()
  const [payment, setPayment] = useState(initialPayment)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)

  const enrollment = payment.enrollment
  const student = enrollment?.student
  const cls = enrollment?.class

  useEffect(() => {
    async function loadReceipt() {
      if (!payment.receipt_url) {
        setReceiptLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/payment/receipt-url?paymentId=${payment.id}`)
        if (res.ok) {
          const { url } = await res.json()
          setReceiptUrl(url)
        }
      } finally {
        setReceiptLoading(false)
      }
    }
    loadReceipt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runAction(action: 'confirm' | 'reject' | 'revert') {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo procesar la acción')
        setActionLoading(false)
        return
      }
      setPayment((prev: any) => ({
        ...prev,
        status: data.paymentStatus,
        confirmed_by: action === 'revert' ? null : 'teacher',
        confirmed_at: action === 'revert' ? null : new Date().toISOString(),
        enrollment: { ...prev.enrollment, status: data.enrollmentStatus },
      }))
    } catch {
      setError('Error de red. Intenta de nuevo.')
    } finally {
      setActionLoading(false)
      setShowRejectConfirm(false)
      setShowRevertConfirm(false)
    }
  }

  const scanResult = payment.scan_result as { fields?: Record<string, unknown>; confidence?: Record<string, number>; issues?: string[] } | null
  const autoConfirmedByAi = payment.confirmed_by === 'ai' && payment.status === 'verified'
  const isTerminalReadOnly = !autoConfirmedByAi && (payment.status === 'verified' || payment.status === 'rejected')
  const awaitingReview = payment.status === 'pending'

  return (
    <div className="px-4 py-4 space-y-5 max-w-xl mx-auto">
      {showRejectConfirm && (
        <ConfirmDialog
          title="Rechazar pago"
          message={`¿Rechazar el comprobante de ${student?.full_name}? El alumno podrá subir uno nuevo.`}
          confirmLabel="Rechazar"
          destructive
          loading={actionLoading}
          onConfirm={() => runAction('reject')}
          onCancel={() => setShowRejectConfirm(false)}
        />
      )}
      {showRevertConfirm && (
        <ConfirmDialog
          title="Revertir confirmación automática"
          message="Este pago fue confirmado automáticamente por la IA. Al revertirlo, el alumno vuelve a quedar pendiente de tu revisión manual."
          confirmLabel="Revertir"
          loading={actionLoading}
          onConfirm={() => runAction('revert')}
          onCancel={() => setShowRevertConfirm(false)}
        />
      )}

      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text">
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Revisar pago</h1>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-0.5">{cls?.title}</p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <Avatar src={student?.avatar_url} name={student?.full_name ?? '?'} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">{student?.full_name}</p>
          <p className="text-xs text-gray-500 dark:text-dark-text2">@{student?.username}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 dark:text-dark-text">{formatCLP(payment.amount)}</p>
          <p className="text-xs text-gray-400 dark:text-dark-text2">{formatDate(payment.submitted_at)}</p>
        </div>
      </div>

      {/* Receipt */}
      <div>
        <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text mb-2">Comprobante</h3>
        <div className="card p-3 flex items-center justify-center min-h-[160px] bg-gray-50 dark:bg-dark-surface">
          {receiptLoading ? (
            <Loader2 className="h-6 w-6 text-gray-300 dark:text-dark-border animate-spin" />
          ) : !receiptUrl ? (
            <p className="text-sm text-gray-400 dark:text-dark-text2">Sin comprobante adjunto</p>
          ) : isPdfPath(payment.receipt_url) ? (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-200 font-medium"
            >
              <FileText className="h-4 w-4" />
              Abrir comprobante (PDF)
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl} alt="Comprobante" className="max-h-96 rounded-xl object-contain" />
            </a>
          )}
        </div>
      </div>

      {/* AI extracted fields */}
      {scanResult && (scanResult.fields || scanResult.issues?.length) && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-dark-text">Datos extraídos por IA</h3>
          </div>
          {scanResult.fields && Object.entries(scanResult.fields).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-text2 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="font-medium text-gray-900 dark:text-dark-text">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Verdict banner + actions */}
      {autoConfirmedByAi && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <span className="font-semibold">Confirmado automáticamente por IA.</span> El alumno ya ve su inscripción como confirmada.
            </p>
          </div>
          <button
            onClick={() => setShowRevertConfirm(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-700 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revertir confirmación
          </button>
        </div>
      )}

      {isTerminalReadOnly && (
        <div className={`rounded-xl border p-4 flex items-center gap-2.5 ${
          payment.status === 'verified'
            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
            : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
        }`}>
          {payment.status === 'verified' ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          )}
          <p className={`text-sm font-medium ${payment.status === 'verified' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {payment.status === 'verified' ? 'Pago confirmado' : 'Pago rechazado'}
          </p>
        </div>
      )}

      {awaitingReview && payment.ai_verdict === 'clean' && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 dark:text-green-400">No vemos ningún problema. ¿Confirmas el pago?</p>
          </div>
          <button
            onClick={() => runAction('confirm')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </button>
        </div>
      )}

      {awaitingReview && payment.ai_verdict === 'issue' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Detectamos un problema:</span>{' '}
              {(scanResult?.issues?.length ? scanResult.issues.join(', ') : 'revisa el comprobante con atención')}. ¿Confirmas el pago?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runAction('confirm')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar
            </button>
            <button
              onClick={() => setShowRejectConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Rechazar
            </button>
          </div>
        </div>
      )}

      {awaitingReview && payment.ai_verdict === 'none' && (
        <div className="flex gap-2">
          <button
            onClick={() => runAction('confirm')}
            disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </button>
          <button
            onClick={() => setShowRejectConfirm(true)}
            disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Rechazar
          </button>
        </div>
      )}
    </div>
  )
}
