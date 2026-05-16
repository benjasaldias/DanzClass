'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Video, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'

interface Audition {
  id: string
  applicant_id: string
  full_name: string
  age: number | null
  phone: string | null
  video_url: string | null
  status: 'pending' | 'accepted' | 'rejected'
  notes: string | null
  created_at: string
  applicant: { username: string; full_name: string; avatar_url: string | null }
}

interface AuditionsListClientProps {
  classId: string
  classTitle: string
  auditions: Audition[]
  auditionClosed: boolean
}

export default function AuditionsListClient({
  classId,
  classTitle,
  auditions: initialAuditions,
  auditionClosed: initialClosed,
}: AuditionsListClientProps) {
  const router = useRouter()
  const [auditions, setAuditions] = useState(initialAuditions)
  const [auditionClosed, setAuditionClosed] = useState(initialClosed)
  const [acting, setActing] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  async function handleStatusChange(auditionId: string, status: 'accepted' | 'rejected', applicantId: string) {
    setActing(auditionId)
    const supabase = createClient()
    await (supabase as any).from('auditions').update({ status }).eq('id', auditionId)

    const notifType = status === 'accepted' ? 'audition_accepted' : 'audition_rejected'
    await (supabase as any).from('notifications').insert({
      user_id: applicantId,
      type: notifType,
      data: { class_id: classId, class_title: classTitle },
    })

    setAuditions((prev) => prev.map((a) => a.id === auditionId ? { ...a, status } : a))
    setActing(null)
  }

  async function handleCloseAuditions() {
    setClosing(true)
    const supabase = createClient()
    await supabase.from('classes' as any).update({ audition_closed: true } as any).eq('id', classId)
    setAuditionClosed(true)
    setClosing(false)
    router.refresh()
  }

  const pending = auditions.filter((a) => a.status === 'pending')
  const decided = auditions.filter((a) => a.status !== 'pending')

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Postulaciones</h1>
          <p className="text-sm text-gray-500">{classTitle}</p>
        </div>
        {!auditionClosed && (
          <button
            onClick={handleCloseAuditions}
            disabled={closing}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cerrar postulaciones
          </button>
        )}
      </div>

      {auditionClosed && (
        <div className="mb-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Las postulaciones están cerradas. Ahora puedes editar la clase normalmente.
        </div>
      )}

      {auditions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">Aún no hay postulaciones</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pendientes ({pending.length})</h2>
              <div className="space-y-2">
                {pending.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    acting={acting}
                    onAccept={() => handleStatusChange(a.id, 'accepted', a.applicant_id)}
                    onReject={() => handleStatusChange(a.id, 'rejected', a.applicant_id)}
                    showActions={!auditionClosed}
                  />
                ))}
              </div>
            </div>
          )}

          {decided.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Decididas ({decided.length})</h2>
              <div className="space-y-2">
                {decided.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    acting={acting}
                    onAccept={() => handleStatusChange(a.id, 'accepted', a.applicant_id)}
                    onReject={() => handleStatusChange(a.id, 'rejected', a.applicant_id)}
                    showActions={!auditionClosed}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AuditionCard({
  audition,
  acting,
  onAccept,
  onReject,
  showActions,
}: {
  audition: Audition
  acting: string | null
  onAccept: () => void
  onReject: () => void
  showActions: boolean
}) {
  const statusConfig = {
    pending: { color: 'bg-gray-50 border-gray-200', badge: null },
    accepted: { color: 'bg-green-50 border-green-200', badge: 'Aceptada' },
    rejected: { color: 'bg-red-50 border-red-200', badge: 'Rechazada' },
  }
  const cfg = statusConfig[audition.status]

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', cfg.color)}>
      <div className="flex items-center gap-3">
        <Avatar src={audition.applicant?.avatar_url} name={audition.full_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">{audition.full_name}</p>
            {cfg.badge && (
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                audition.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              )}>
                {cfg.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">@{audition.applicant?.username}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {audition.age && <span className="text-xs text-gray-400">{audition.age} años</span>}
            {audition.phone && <span className="text-xs text-gray-400">{audition.phone}</span>}
          </div>
        </div>
        {audition.video_url && (
          <a
            href={audition.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Video className="h-3.5 w-3.5" />
            Ver video
          </a>
        )}
      </div>

      {showActions && audition.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            disabled={acting === audition.id}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {acting === audition.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Aceptar
          </button>
          <button
            onClick={onReject}
            disabled={acting === audition.id}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {acting === audition.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Rechazar
          </button>
        </div>
      )}
    </div>
  )
}
