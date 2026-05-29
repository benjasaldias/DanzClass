'use client'

import { AlertTriangle, XCircle, Users, TrendingUp } from 'lucide-react'

interface AdminStats {
  debtorsCount: number
  cancelledRecentCount: number
  topReported: { content_type: string; content_id: string; count: number }[]
}

export default function AdminStatsClient({ stats }: { stats: AdminStats }) {
  const { debtorsCount, cancelledRecentCount, topReported } = stats

  return (
    <div className="p-4 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Deudores</span>
          </div>
          <p className="text-3xl font-bold text-amber-900 dark:text-amber-300">{debtorsCount}</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">enrollments sin pagar &gt; 48 h</p>
        </div>

        <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Canceladas</span>
          </div>
          <p className="text-3xl font-bold text-red-900 dark:text-red-300">{cancelledRecentCount}</p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-1">clases canceladas (14 días)</p>
        </div>
      </div>

      {/* Top reportados */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-coral-fuego" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-dark-text">Contenido más reportado</h2>
        </div>

        {topReported.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-gray-400 dark:text-dark-text2">
            <Users className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Sin reportes activos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topReported.map((item, i) => (
              <div
                key={item.content_id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3"
              >
                <span className="text-lg font-bold text-gray-300 dark:text-dark-border w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`badge text-xs ${item.content_type === 'post' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'}`}>
                      {item.content_type === 'post' ? 'Video' : 'Clase'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-dark-text2 font-mono truncate">{item.content_id.slice(0, 12)}…</span>
                  </div>
                </div>
                <span className="flex-shrink-0 text-sm font-bold text-coral-fuego">{item.count} reporte{item.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
