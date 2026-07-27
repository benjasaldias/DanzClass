'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Play, Trash2, Eye, Loader2, X, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { daysUntilPurge, postQuotaForTier, PLAN_HIDDEN_RETENTION_DAYS } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface HiddenPost {
  id: string
  title: string
  video_url: string | null
  thumbnail_url: string | null
  plan_hidden_at: string | null
  [key: string]: any
}

interface Props {
  hiddenPosts: HiddenPost[]
  visiblePosts: HiddenPost[]
  tier: SubscriptionTier
}

function Thumb({ post }: { post: HiddenPost }) {
  if (post.thumbnail_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={post.thumbnail_url} alt={post.title} className="h-full w-full object-cover" />
  }
  if (post.video_url) {
    return <video src={post.video_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
  }
  return <div className="h-full w-full bg-gradient-to-br from-brand-700 to-morado-flow" />
}

/**
 * Biblioteca de videos ocultos por falta de plan (posts.plan_hidden_at != null).
 * Solo la ve su autor. Permite sustituir uno de los videos visibles por uno
 * guardado (el sustituido pasa a esta misma biblioteca, no se borra) o borrarlo
 * definitivamente. Ver 060_post_plan_visibility.sql.
 */
export default function PlanHiddenPosts({ hiddenPosts, visiblePosts, tier }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<HiddenPost | null>(null)
  const [choosingDemote, setChoosingDemote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quota = postQuotaForTier(tier)
  const atQuota = visiblePosts.length >= quota

  function close() {
    if (busy) return
    setSelected(null)
    setChoosingDemote(false)
    setError(null)
  }
  useEscapeKey(close, !!selected)

  async function expose(postId: string, demoteId?: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: rpcError } = await (supabase as any).rpc('expose_post', {
      p_post_id: postId,
      p_demote_id: demoteId ?? null,
    })
    setBusy(false)
    if (rpcError) {
      setError('No se pudo mostrar el video. Revisa tu plan e intenta de nuevo.')
      return
    }
    setSelected(null)
    setChoosingDemote(false)
    router.refresh()
  }

  async function remove(postId: string) {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/post/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    })
    setBusy(false)
    if (!res.ok) {
      setError('No se pudo eliminar el video.')
      return
    }
    setSelected(null)
    router.refresh()
  }

  if (hiddenPosts.length === 0) return null

  const soonest = hiddenPosts
    .map((p) => daysUntilPurge(p.plan_hidden_at))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)[0]

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex gap-2">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              {hiddenPosts.length === 1 ? '1 video privado por tu plan' : `${hiddenPosts.length} videos privados por tu plan`}
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              {quota === 0
                ? 'Sin plan activo, tus videos solo los ves tú.'
                : quota === Infinity
                  ? 'Tu plan no tiene límite de videos: puedes volver a mostrarlos todos.'
                  : `Tu plan cubre ${quota} ${quota === 1 ? 'video visible' : 'videos visibles'}. Los demás quedan aquí.`}{' '}
              Se eliminan {PLAN_HIDDEN_RETENTION_DAYS / 30} meses después de ocultarse
              {typeof soonest === 'number' && soonest > 0 ? ` (el primero, en ${soonest} ${soonest === 1 ? 'día' : 'días'})` : ''}.{' '}
              <Link href="/plans" className="font-semibold underline underline-offset-2">
                Ver planes
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-0.5">
        {hiddenPosts.map((p) => {
          const days = daysUntilPurge(p.plan_hidden_at)
          return (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setChoosingDemote(false); setError(null) }}
              className="group relative aspect-square overflow-hidden bg-gray-900"
            >
              <div className="h-full w-full opacity-40 grayscale transition-opacity group-hover:opacity-60">
                <Thumb post={p} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Lock className="h-5 w-5 text-white drop-shadow" />
              </div>
              {typeof days === 'number' && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-medium text-white">
                  {days > 0 ? `${days} d` : 'hoy'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={close}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-dark-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-dark-text">
                {choosingDemote ? '¿Cuál guardas en privado?' : selected.title}
              </h3>
              <button onClick={close} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
            )}

            {!choosingDemote ? (
              <>
                <div className="mb-3 aspect-video overflow-hidden rounded-xl bg-black">
                  {selected.video_url ? (
                    <video src={selected.video_url} controls playsInline className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Play className="h-8 w-8 text-white/60" /></div>
                  )}
                </div>

                {(() => {
                  const days = daysUntilPurge(selected.plan_hidden_at)
                  return (
                    <p className="mb-4 flex items-start gap-1.5 text-xs text-gray-500 dark:text-dark-text2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                      <span>
                        Solo tú puedes verlo.{' '}
                        {typeof days === 'number' && days > 0
                          ? `Se eliminará en ${days} ${days === 1 ? 'día' : 'días'} si sigue privado.`
                          : 'Se eliminará en la próxima limpieza si sigue privado.'}
                      </span>
                    </p>
                  )
                })()}

                <div className="space-y-2">
                  {quota === 0 ? (
                    <Link href="/plans" className="btn-primary block w-full py-2.5 text-center text-sm">
                      Activar un plan para publicarlo
                    </Link>
                  ) : (
                    <button
                      onClick={() => (atQuota ? setChoosingDemote(true) : expose(selected.id))}
                      disabled={busy}
                      className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {atQuota ? 'Mostrar en vez de otro' : 'Mostrar en mi perfil'}
                    </button>
                  )}
                  <button
                    onClick={() => remove(selected.id)}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar definitivamente
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-gray-500 dark:text-dark-text2">
                  Tu plan cubre {quota} {quota === 1 ? 'video visible' : 'videos visibles'}. El que elijas pasa a privado
                  (no se borra) y empieza su propio plazo de {PLAN_HIDDEN_RETENTION_DAYS / 30} meses.
                </p>
                <div className="space-y-2">
                  {visiblePosts.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => expose(selected.id, v.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-2 text-left hover:border-brand-300 disabled:opacity-50 dark:border-dark-border dark:hover:border-brand-500"
                    >
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-900">
                        <Thumb post={v} />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-dark-text">{v.title}</span>
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setChoosingDemote(false)}
                  disabled={busy}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-dark-border dark:text-dark-text2"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
