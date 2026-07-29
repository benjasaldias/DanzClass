import { formatCLP } from '@/lib/utils'

interface MonthRow { month: string; commission: number; base: number; count: number }
interface TeacherRow { teacherId: string; name: string; base: number; commission: number; count: number }

export interface ReconciliationData {
  totalCommission: number
  totalBase: number
  totalGross: number
  count: number
  /** Costo de procesamiento COBRADO al alumno (tramo estimado, con gross-up). */
  totalFeeCharged: number
  /** Costo de procesamiento que Mercado Pago cobró de verdad. */
  totalFeeReal: number
  /** Pagos con costo real conocido (los anteriores a la migración 070 no lo tienen). */
  feeKnownCount: number
  byMonth: MonthRow[]
  byTeacher: TeacherRow[]
}

// Panel de conciliación de pagos in-app (Mercado Pago split). Solo superadmin.
// `commission_amount` es el ingreso de DanzClass (tributable). `amount` (base) ya
// fue liquidado por Mercado Pago directamente a la cuenta de cada profesor.
export default function AdminReconciliationClient({ data }: { data: ReconciliationData }) {
  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">Conciliación — pagos in-app (Mercado Pago)</h2>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mt-1">
          Solo pagos con split confirmados (<code>payment_method=mp</code>, <code>status=verified</code>). La{' '}
          <strong>comisión</strong> es el ingreso de DanzClass (tributable); la <strong>base</strong> fue
          liquidada por Mercado Pago directamente a la cuenta de cada profesor.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Comisión total (tu ingreso)" value={formatCLP(data.totalCommission)} highlight />
        <StatCard label="Liquidado a profesores" value={formatCLP(data.totalBase)} />
        <StatCard label="Bruto procesado" value={formatCLP(data.totalGross)} />
        <StatCard label="Pagos confirmados" value={String(data.count)} />
      </div>

      {/* Excedente del tramo de procesamiento (D-2) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
          Costo de procesamiento de Mercado Pago
        </h3>
        <p className="text-sm text-gray-500 dark:text-dark-text2 mb-3">
          Al alumno se le cobra el tramo de <strong>disponibilidad inmediata</strong> (3,19% + IVA), el más caro,
          porque Mercado Pago no expone el plazo de liberación de cada cuenta. Cuando el profesor libera a 10 o 30
          días, MP cobra menos y esa diferencia <strong>queda en DanzClass</strong>. No es comisión de servicio:
          va acá aparte para que sea contabilizable.
        </p>
        {data.feeKnownCount === 0 ? (
          <p className="text-sm text-gray-400 dark:text-dark-text2">
            Aún no hay pagos con costo real informado por Mercado Pago.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Cobrado al alumno (estimado)" value={formatCLP(data.totalFeeCharged)} />
              <StatCard label="Cobrado por Mercado Pago (real)" value={formatCLP(data.totalFeeReal)} />
              <StatCard
                label="Excedente retenido"
                value={formatCLP(data.totalFeeCharged - data.totalFeeReal)}
                highlight
              />
              <StatCard label="Pagos con dato real" value={`${data.feeKnownCount} de ${data.count}`} />
            </div>
            {data.totalFeeCharged - data.totalFeeReal < 0 && (
              <p className="text-sm text-coral-fuego mt-3">
                El excedente es negativo: Mercado Pago está cobrando más que el tramo estimado. Revisa
                <code className="mx-1">MP_FEE_RATE</code>
                en packages/shared/src/lib/commission.ts — con esa diferencia el profesor no recibe el 100%.
              </p>
            )}
          </>
        )}
      </div>

      {/* Por mes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Por mes</h3>
        {data.byMonth.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-dark-text2">Aún no hay pagos in-app confirmados.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-dark-border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-surface2 text-gray-500 dark:text-dark-text2">
                <tr>
                  <Th>Mes</Th><Th right>Pagos</Th><Th right>Comisión</Th><Th right>Base (profes)</Th>
                </tr>
              </thead>
              <tbody>
                {data.byMonth.map((m) => (
                  <tr key={m.month} className="border-t border-gray-100 dark:border-dark-border">
                    <Td>{m.month}</Td>
                    <Td right>{m.count}</Td>
                    <Td right className="font-semibold text-brand-700 dark:text-brand-300">{formatCLP(m.commission)}</Td>
                    <Td right>{formatCLP(m.base)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Por profesor */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">Por profesor</h3>
        {data.byTeacher.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-dark-text2">—</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-dark-border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-surface2 text-gray-500 dark:text-dark-text2">
                <tr>
                  <Th>Profesor</Th><Th right>Pagos</Th><Th right>Base recibida</Th><Th right>Comisión generada</Th>
                </tr>
              </thead>
              <tbody>
                {data.byTeacher.map((t) => (
                  <tr key={t.teacherId} className="border-t border-gray-100 dark:border-dark-border">
                    <Td>{t.name}</Td>
                    <Td right>{t.count}</Td>
                    <Td right>{formatCLP(t.base)}</Td>
                    <Td right className="text-brand-700 dark:text-brand-300">{formatCLP(t.commission)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-dark-text2/70">
        Nota: esta vista es un registro interno para tu contabilidad. Mercado Pago es la fuente autoritativa de
        los movimientos reales; concilia estos totales contra tu panel de Mercado Pago.
      </p>
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? 'border-brand-200 dark:border-brand-900/50 bg-brand-50 dark:bg-brand-950/30' : 'border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface'}`}>
      <p className={`text-xs ${highlight ? 'text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-dark-text2'}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-brand-900 dark:text-brand-200' : 'text-gray-900 dark:text-dark-text'}`}>{value}</p>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}
function Td({ children, right, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-3 py-2 text-gray-900 dark:text-dark-text ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</td>
}
