'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, GraduationCap, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadPostInteractions, setPostLike, TEACH_REQUEST_LABEL, teachRequestSummary } from '@danceclass/shared'
import { cn } from '@/lib/utils'

interface PostActionsProps {
  postId: string
  authorId: string
  /** Contadores denormalizados que vienen en la fila del post (ver 076). */
  likesCount?: number | null
  teachRequestsCount?: number | null
  /** El autor habilitó "¡Enséñala!" al publicar. */
  allowTeachRequests?: boolean | null
  currentUserId?: string | null
}

export default function PostActions({
  postId,
  authorId,
  likesCount,
  teachRequestsCount,
  allowTeachRequests,
  currentUserId,
}: PostActionsProps) {
  const router = useRouter()
  const isAuthor = !!currentUserId && currentUserId === authorId

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(Number(likesCount ?? 0))
  const [requested, setRequested] = useState(false)
  const [requests, setRequests] = useState(Number(teachRequestsCount ?? 0))
  const [teachPending, setTeachPending] = useState(false)
  const [teachError, setTeachError] = useState<string | null>(null)
  // Rebote del corazón al marcarlo (el detalle que hace que se sienta una red social).
  const [beat, setBeat] = useState(false)
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado propio ("¿lo marqué yo?"): lo resuelve el loader agrupador de shared,
  // que junta en una sola consulta todas las tarjetas visibles.
  useEffect(() => {
    let alive = true
    if (!currentUserId) { setLiked(false); setRequested(false); return }
    loadPostInteractions(createClient(), currentUserId, postId).then((flags) => {
      if (!alive) return
      setLiked(flags.liked)
      setRequested(flags.requested)
    })
    return () => { alive = false }
  }, [postId, currentUserId])

  useEffect(() => () => { if (beatTimer.current) clearTimeout(beatTimer.current) }, [])

  function requireSession(): boolean {
    if (currentUserId) return true
    router.push('/auth/login')
    return false
  }

  async function toggleLike() {
    if (!requireSession()) return
    const next = !liked
    // Optimista: el corazón responde al toque, no a la red.
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    if (next) {
      setBeat(true)
      if (beatTimer.current) clearTimeout(beatTimer.current)
      beatTimer.current = setTimeout(() => setBeat(false), 260)
    }
    const ok = await setPostLike(createClient(), postId, currentUserId!, next)
    if (!ok) {
      setLiked(!next)
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
    }
  }

  async function toggleTeachRequest() {
    if (!requireSession()) return
    if (teachPending) return
    const next = !requested
    setTeachPending(true)
    setTeachError(null)
    try {
      const res = await fetch('/api/post/teach-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action: next ? 'add' : 'remove' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTeachError(
          body?.error === 'teach_requests_disabled'
            ? 'El autor ya no acepta pedidos para este video.'
            : 'No se pudo enviar tu pedido. Intenta de nuevo.'
        )
        return
      }
      setRequested(!!body.requested)
      setRequests(Number(body.count ?? 0))
    } catch {
      setTeachError('Sin conexión. Intenta de nuevo.')
    } finally {
      setTeachPending(false)
    }
  }

  const showTeachButton = !!allowTeachRequests && !isAuthor
  // Al autor no se le ofrece pedirse a sí mismo: se le muestra la demanda, que
  // es la señal útil ("ya hay 12 esperando esta clase").
  const showTeachSummary = !!allowTeachRequests && isAuthor

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        onClick={toggleLike}
        aria-pressed={liked}
        aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors active:scale-95',
          liked
            ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
            : 'border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-text2 hover:border-red-200 hover:text-red-500'
        )}
      >
        <Heart
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            liked && 'fill-current',
            beat && 'scale-125'
          )}
        />
        {likes > 0 && <span className="tabular-nums">{likes}</span>}
      </button>

      {showTeachButton && (
        <button
          onClick={toggleTeachRequest}
          disabled={teachPending}
          aria-pressed={requested}
          title={requested ? 'Ya pediste que enseñen esta coreografía' : 'Pídele que enseñe esta coreografía'}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors active:scale-95 disabled:opacity-60',
            requested
              ? 'border-transparent bg-morado-flow text-white'
              : 'border-morado-flow/40 text-morado-flow hover:bg-morado-flow/10'
          )}
        >
          {teachPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <GraduationCap className="h-4 w-4" />}
          <span>{TEACH_REQUEST_LABEL}</span>
          {requests > 0 && <span className="tabular-nums opacity-80">{requests}</span>}
        </button>
      )}

      {showTeachSummary && (
        <span className="flex items-center gap-1.5 rounded-full border border-morado-flow/30 bg-morado-flow/10 px-3 py-1.5 text-sm text-morado-flow">
          <GraduationCap className="h-4 w-4" />
          {teachRequestSummary(requests)}
        </span>
      )}

      {teachError && (
        <span className="w-full text-xs text-red-600 dark:text-red-400">{teachError}</span>
      )}
    </div>
  )
}
