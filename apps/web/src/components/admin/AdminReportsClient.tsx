'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trash2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const REASON_LABELS: Record<string, string> = {
  copyright: 'Derechos de autor',
  inappropriate: 'Contenido inapropiado',
  spam: 'Spam',
  other: 'Otro',
}

interface Report {
  id: string
  content_type: string
  content_id: string
  reason: string
  description: string | null
  status: string
  created_at: string
  reporter: {
    id: string
    username: string
    full_name: string
    avatar_url: string | null
  } | null
}

export default function AdminReportsClient({ reports: initialReports }: { reports: Report[] }) {
  const router = useRouter()
  const [reports, setReports] = useState(initialReports)
  const [confirm, setConfirm] = useState<{ action: 'delete_content' | 'dismiss_report'; report: Report } | null>(null)
  const [loading, setLoading] = useState(false)

  async function executeAction(action: 'delete_content' | 'dismiss_report', report: Report) {
    setLoading(true)
    await fetch('/api/admin/content-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        contentType: report.content_type,
        contentId: report.content_id,
        reportId: report.id,
      }),
    })
    setReports((prev) => prev.filter((r) => r.id !== report.id))
    setConfirm(null)
    setLoading(false)
    router.refresh()
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center text-gray-500">
        <XCircle className="h-12 w-12 text-gray-200 mb-3" />
        <p className="text-sm">Sin reportes pendientes</p>
      </div>
    )
  }

  return (
    <>
      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'delete_content' ? 'Eliminar contenido' : 'Descartar reporte'}
          message={
            confirm.action === 'delete_content'
              ? `¿Eliminar este ${confirm.report.content_type === 'post' ? 'video' : 'clase'}? Esta acción no se puede deshacer.`
              : '¿Descartar este reporte sin tomar acción?'
          }
          confirmLabel={confirm.action === 'delete_content' ? 'Eliminar' : 'Descartar'}
          destructive={confirm.action === 'delete_content'}
          loading={loading}
          onConfirm={() => executeAction(confirm.action, confirm.report)}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="divide-y divide-gray-100">
        {reports.map((report) => {
          const contentHref = report.content_type === 'class'
            ? `/class/${report.content_id}`
            : null

          return (
            <div key={report.id} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <Avatar
                  src={report.reporter?.avatar_url ?? null}
                  name={report.reporter?.full_name ?? '?'}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      @{report.reporter?.username ?? 'desconocido'}
                    </span>
                    <span className="badge bg-coral-fuego/15 text-coral-fuego capitalize">
                      {REASON_LABELS[report.reason] ?? report.reason}
                    </span>
                    <span className={`badge ${report.content_type === 'post' ? 'bg-blue-100 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                      {report.content_type === 'post' ? 'Video' : 'Clase'}
                    </span>
                  </div>
                  {report.description && (
                    <p className="text-sm text-gray-600 mt-1 leading-snug">{report.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-xs text-gray-400">{timeAgo(report.created_at)}</span>
                    {contentHref && (
                      <Link
                        href={contentHref}
                        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver contenido
                      </Link>
                    )}
                    {!contentHref && (
                      <span className="text-xs text-gray-400">ID: {report.content_id.slice(0, 8)}…</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-3 pl-9">
                <button
                  onClick={() => setConfirm({ action: 'delete_content', report })}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar contenido
                </button>
                <button
                  onClick={() => setConfirm({ action: 'dismiss_report', report })}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Descartar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
