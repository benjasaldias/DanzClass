'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Video, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { sendNotifications } from '@/lib/notifications'
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
  // Local decisions: only written to DB on "Publicar Resultados"
  const [localDecisions, setLocalDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [publishing, setPublishing] = useState(false)
  const [closing, setClosing] = useState(false)

  function setDecision(auditionId: string, decision: 'accepted' | 'rejected') {
    setLocalDecisions((prev) => ({ ...prev, [auditionId]: decision }))
  }

  function clearDecision(auditionId: string) {
    setLocalDecisions((prev) => {
      const next = { ...prev }
      delete next[auditionId]
      return next
    })
  }

  async function enrollAccepted(toPublish: typeof auditions) {
    const acceptedIds = toPublish
      .filter((a) => localDecisions[a.id] === 'accepted')
      .map((a) => a.applicant_id)
    if (acceptedIds.length === 0) return
    await fetch('/api/class/auditions/enroll-accepted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, applicantIds: acceptedIds }),
    })
  }

  async function handlePublish() {
    const pending = auditions.filter((a) => a.status === 'pending')
    // Only publish decisions for pending auditions
    const toPublish = pending.filter((a) => localDecisions[a.id])
    if (toPublish.length === 0) return

    setPublishing(true)
    const supabase = createClient()

    await Promise.all(
      toPublish.map((a) =>
        (supabase as any).from('auditions').update({ status: localDecisions[a.id] }).eq('id', a.id)
      )
    )

    const accepted = toPublish.filter((a) => localDecisions[a.id] === 'accepted')
    const rejected = toPublish.filter((a) => localDecisions[a.id] === 'rejected')
    if (accepted.length > 0) {
      await sendNotifications(accepted.map((a) => ({
        user_id: a.applicant_id,
        type: 'audition_accepted',
        data: { class_id: classId, class_title: classTitle },
      })))
    }
    if (rejected.length > 0) {
      await sendNotifications(rejected.map((a) => ({
        user_id: a.applicant_id,
        type: 'audition_rejected',
        data: { class_id: classId, class_title: classTitle },
      })))
    }

    await enrollAccepted(toPublish)

    setAuditions((prev) =>
      prev.map((a) =>
        localDecisions[a.id] ? { ...a, status: localDecisions[a.id] } : a
      )
    )
    setLocalDecisions({})
    setPublishing(false)
  }

  async function handleCloseAuditions() {
    setClosing(true)
    const supabase = createClient()

    // Persist any draft decisions before closing so they are not lost
    const pending = auditions.filter((a) => a.status === 'pending')
    const toPublish = pending.filter((a) => localDecisions[a.id])

    if (toPublish.length > 0) {
      await Promise.all(
        toPublish.map((a) =>
          (supabase as any).from('auditions').update({ status: localDecisions[a.id] }).eq('id', a.id)
        )
      )
      const acceptedC = toPublish.filter((a) => localDecisions[a.id] === 'accepted')
      const rejectedC = toPublish.filter((a) => localDecisions[a.id] === 'rejected')
      if (acceptedC.length > 0) {
        await sendNotifications(acceptedC.map((a) => ({
          user_id: a.applicant_id,
          type: 'audition_accepted',
          data: { class_id: classId, class_title: classTitle },
        })))
      }
      if (rejectedC.length > 0) {
        await sendNotifications(rejectedC.map((a) => ({
          user_id: a.applicant_id,
          type: 'audition_rejected',
          data: { class_id: classId, class_title: classTitle },
        })))
      }
      await enrollAccepted(toPublish)
      setAuditions((prev) =>
        prev.map((a) =>
          localDecisions[a.id] ? { ...a, status: localDecisions[a.id] as 'accepted' | 'rejected' } : a
        )
      )
      setLocalDecisions({})
    }

    // Also enroll any previously accepted auditions that may still lack an enrollment
    const alreadyAccepted = auditions.filter((a) => a.status === 'accepted')
    if (alreadyAccepted.length > 0) {
      await fetch('/api/class/auditions/enroll-accepted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, applicantIds: alreadyAccepted.map((a) => a.applicant_id) }),
      })
    }

    await supabase.from('classes' as any).update({ audition_closed: true } as any).eq('id', classId)
    setAuditionClosed(true)
    setClosing(false)
    router.refresh()
  }

  async function handleReopenAuditions() {
    setClosing(true)
    const supabase = createClient()
    await supabase.from('classes' as any).update({ audition_closed: false } as any).eq('id', classId)
    setAuditionClosed(false)
    setClosing(false)
  }

  const pendingAuditions = auditions.filter((a) => a.status === 'pending')
  const decidedAuditions = auditions.filter((a) => a.status !== 'pending')
  const pendingDecisionsCount = pendingAuditions.filter((a) => localDecisions[a.id]).length

  return (
    <div className="px-4 py-4 pb-32">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Postulaciones</h1>
          <p className="text-sm text-gray-500 dark:text-dark-text2">{classTitle}</p>
        </div>
        {auditionClosed ? (
          <button
            onClick={handleReopenAuditions}
            disabled={closing}
            className="flex items-center gap-1.5 rounded-xl border border-[#7F77DD]/40 dark:border-violet-700/40 bg-[#EEEDFE] dark:bg-dark-surface2 px-3 py-2 text-xs font-semibold text-[#534AB7] dark:text-violet-300 hover:bg-[#EEEDFE]/80 dark:hover:bg-dark-surface2/80 transition-colors disabled:opacity-50"
          >
            {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Reabrir postulaciones
          </button>
        ) : (
          <button
            onClick={handleCloseAuditions}
            disabled={closing}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
          >
            {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cerrar postulaciones
          </button>
        )}
      </div>

      {auditionClosed && (
        <div className="mb-4 rounded-xl bg-gray-50 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border px-4 py-3 text-sm text-gray-600 dark:text-dark-text2">
          Postulaciones cerradas — los resultados publicados fueron enviados a los postulantes. Puedes reabrir si necesitas recibir más postulaciones.
        </div>
      )}

      {auditions.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-dark-text2">
          <p className="text-sm">Aún no hay postulaciones</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingAuditions.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider mb-2">
                Pendientes ({pendingAuditions.length})
              </h2>
              <div className="space-y-2">
                {pendingAuditions.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    localDecision={localDecisions[a.id] ?? null}
                    onAccept={() => setDecision(a.id, 'accepted')}
                    onReject={() => setDecision(a.id, 'rejected')}
                    onClear={() => clearDecision(a.id)}
                    showActions={!auditionClosed}
                  />
                ))}
              </div>
            </div>
          )}

          {decidedAuditions.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider mb-2">
                Publicadas ({decidedAuditions.length})
              </h2>
              <div className="space-y-2">
                {decidedAuditions.map((a) => (
                  <AuditionCard
                    key={a.id}
                    audition={a}
                    localDecision={null}
                    onAccept={() => {}}
                    onReject={() => {}}
                    onClear={() => {}}
                    showActions={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky publish bar */}
      {!auditionClosed && pendingDecisionsCount > 0 && (
        <div className="fixed bottom-app-nav left-0 right-0 z-30 mx-auto max-w-lg border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 shadow-lg">
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Publicar resultados ({pendingDecisionsCount} postulaci{pendingDecisionsCount === 1 ? 'ón' : 'ones'})
          </button>
        </div>
      )}
    </div>
  )
}

async function openSignedVideoUrl(videoUrl: string) {
  const supabase = createClient()
  // video_url may be a storage path or a legacy full URL — extract the path
  const path = videoUrl.includes('/audition-videos/')
    ? videoUrl.split('/audition-videos/')[1]
    : videoUrl
  const { data, error } = await supabase.storage.from('audition-videos').createSignedUrl(path, 3600)
  if (data?.signedUrl) {
    window.open(data.signedUrl, '_blank')
  } else {
    alert('No se pudo generar el enlace al video. Intenta de nuevo.')
    console.error(error)
  }
}

function AuditionCard({
  audition,
  localDecision,
  onAccept,
  onReject,
  onClear,
  showActions,
}: {
  audition: Audition
  localDecision: 'accepted' | 'rejected' | null
  onAccept: () => void
  onReject: () => void
  onClear: () => void
  showActions: boolean
}) {
  const effectiveStatus = localDecision ?? audition.status

  const statusConfig = {
    pending: { color: 'bg-gray-50 dark:bg-dark-surface border-gray-200 dark:border-dark-border', badge: null },
    accepted: { color: 'bg-green-100 border-green-200', badge: 'Aceptada' },
    rejected: { color: 'bg-red-50 border-red-200', badge: 'Rechazada' },
  }
  const cfg = statusConfig[effectiveStatus]
  const isDraft = localDecision !== null

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', cfg.color)}>
      <div className="flex items-center gap-3">
        <Avatar src={audition.applicant?.avatar_url} name={audition.full_name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{audition.full_name}</p>
            {effectiveStatus !== 'pending' && (
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                effectiveStatus === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                isDraft && 'opacity-70 ring-1 ring-offset-1',
                isDraft && effectiveStatus === 'accepted' ? 'ring-green-400' : isDraft ? 'ring-red-400' : ''
              )}>
                {effectiveStatus === 'accepted' ? 'Aceptada' : 'Rechazada'}{isDraft ? ' (borrador)' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-text2">@{audition.applicant?.username}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {audition.age && <span className="text-xs text-gray-400 dark:text-dark-text2/60">{audition.age} años</span>}
            {audition.phone && <span className="text-xs text-gray-400 dark:text-dark-text2/60">{audition.phone}</span>}
          </div>
        </div>
        {audition.video_url && (
          <button
            onClick={() => openSignedVideoUrl(audition.video_url!)}
            className="flex-shrink-0 flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Video className="h-3.5 w-3.5" />
            Ver video
          </button>
        )}
      </div>

      {showActions && audition.status === 'pending' && (
        <div className="flex gap-2">
          {localDecision === null ? (
            <>
              <button
                onClick={onAccept}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aceptar
              </button>
              <button
                onClick={onReject}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </>
          ) : (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-dark-border px-3 py-2 text-xs font-medium text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors"
            >
              Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
