'use client'

import Link from 'next/link'
import { CreditCard, Building2, AlertCircle } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { paymentBreakdown } from '@danceclass/shared'

interface PaymentMethodsFieldProps {
  acceptsMp: boolean
  acceptsTransfer: boolean
  onChange: (patch: { accepts_mp?: boolean; accepts_transfer?: boolean }) => void
  /** El profesor conectó su cuenta de Mercado Pago (profiles.mp_connected). */
  mpConnected: boolean
  /** El profesor cargó sus datos bancarios (teacher_payment_info). */
  hasPaymentInfo: boolean
  /** Precio principal de la clase (mensual en periódica/entrenamiento). */
  price?: number
  /** Etiqueta del precio principal en el preview. */
  priceLabel: string
  /** Precio 2x, si el profesor lo configuró. */
  price2x?: number
  /** Precio de clase suelta dentro de una periódica, si aplica. */
  priceSuelta?: number
  /** Precio 2x de una sesión suelta dentro de una periódica, si aplica. */
  priceSuelta2x?: number
  error?: string
}

/** Una fila del preview: cuánto paga el alumno por cada vía habilitada. */
function PricePreview({
  label,
  amount,
  showMp,
  showTransfer,
}: {
  label: string
  amount: number
  showMp: boolean
  showTransfer: boolean
}) {
  // El profesor recibe `amount` íntegro en las dos vías — es la invariante del
  // modelo. Lo que cambia es cuánto paga el alumno por MP (gross-up + comisión
  // de servicio).
  //
  // Desde el lanzamiento gratuito (2026-09-04) el desglose ya no depende del
  // plan del alumno: todas las cuentas son Pro y la comisión se cobra igual a
  // todos (`COMMISSION_APPLIES_TO_ALL_TIERS`), así que acá había dos totales
  // idénticos presentados como si fueran distintos. Queda uno solo.
  const mp = paymentBreakdown(amount, 'none', 'mp')

  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-gray-700 dark:text-dark-text2">
        {label}: recibes <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(amount)}</span>
      </p>
      {showTransfer && (
        <p className="text-xs text-gray-500 dark:text-dark-text2 pl-3">
          · Por transferencia el alumno paga <strong>{formatCLP(amount)}</strong>
        </p>
      )}
      {showMp && (
        <p className="text-xs text-gray-500 dark:text-dark-text2 pl-3">
          · Por Mercado Pago el alumno paga <strong>{formatCLP(mp.total)}</strong>
        </p>
      )}
    </div>
  )
}

export default function PaymentMethodsField({
  acceptsMp,
  acceptsTransfer,
  onChange,
  mpConnected,
  hasPaymentInfo,
  price,
  priceLabel,
  price2x,
  priceSuelta,
  priceSuelta2x,
  error,
}: PaymentMethodsFieldProps) {
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0
  const showPreview = (acceptsMp && mpConnected) || acceptsTransfer

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-dark-text2">Cómo pueden pagarte *</p>
        <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-0.5">
          Elige al menos una vía. Recibes el 100% del precio que fijes en ambas.
        </p>
      </div>

      <label
        className={`flex items-start gap-2 ${mpConnected ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
      >
        <input
          type="checkbox"
          checked={acceptsMp}
          disabled={!mpConnected}
          onChange={(e) => onChange({ accepts_mp: e.target.checked })}
          className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600"
        />
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-dark-text">
            <CreditCard className="h-4 w-4 text-[#009EE3]" />
            Mercado Pago (in-app)
          </span>
          <span className="block text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
            {mpConnected
              ? 'El alumno paga con tarjeta o saldo y su inscripción se confirma sola. El costo de procesamiento lo paga el alumno.'
              : 'Necesitas conectar tu cuenta de Mercado Pago para ofrecer esta vía.'}
          </span>
          {!mpConnected && (
            <Link href="/profile/payment-info" className="text-xs font-medium text-brand-600 dark:text-brand-300 underline">
              Conectar Mercado Pago
            </Link>
          )}
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptsTransfer}
          onChange={(e) => onChange({ accepts_transfer: e.target.checked })}
          className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600"
        />
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-dark-text">
            <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Transferencia bancaria
          </span>
          <span className="block text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
            El alumno te transfiere y sube el comprobante. Tú confirmas el pago. Sin cargos para nadie.
          </span>
        </span>
      </label>

      {acceptsTransfer && !hasPaymentInfo && (
        <div className="flex gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-2">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Aún no cargaste tus datos bancarios: los alumnos no sabrán a qué cuenta transferir.{' '}
            <Link href="/profile/payment-info" className="underline font-medium">Cargarlos ahora</Link>
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {showPreview && validPrice && (
        <div className="rounded-lg bg-gray-50 dark:bg-dark-surface2/60 p-2.5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text2/60">
            Cómo lo verá el alumno
          </p>
          <PricePreview
            label={priceLabel}
            amount={price!}
            showMp={acceptsMp && mpConnected}
            showTransfer={acceptsTransfer}
          />
          {typeof priceSuelta === 'number' && priceSuelta > 0 && (
            <PricePreview
              label="Clase suelta"
              amount={priceSuelta}
              showMp={acceptsMp && mpConnected}
              showTransfer={acceptsTransfer}
            />
          )}
          {typeof price2x === 'number' && price2x > 0 && (
            <PricePreview
              label="Precio 2x"
              amount={price2x}
              showMp={acceptsMp && mpConnected}
              showTransfer={acceptsTransfer}
            />
          )}
          {typeof priceSuelta2x === 'number' && priceSuelta2x > 0 && (
            <PricePreview
              label="Precio 2x (sesión suelta)"
              amount={priceSuelta2x}
              showMp={acceptsMp && mpConnected}
              showTransfer={acceptsTransfer}
            />
          )}
          {acceptsMp && mpConnected && (
            <p className="text-[11px] text-gray-400 dark:text-dark-text2/60">
              La diferencia por Mercado Pago cubre el costo de procesamiento de la pasarela y la comisión
              de servicio de DanzClass. Tú recibes siempre el precio que fijaste.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
