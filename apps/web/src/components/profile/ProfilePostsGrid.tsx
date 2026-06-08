'use client'

import { useState } from 'react'
import { Play, Lock, Users, X } from 'lucide-react'
import PostCard from '@/components/feed/PostCard'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface GridPost {
  id: string
  title: string
  video_url: string | null
  thumbnail_url: string | null
  visibility?: 'public' | 'followers' | 'friends'
  is_public?: boolean
  [key: string]: any
}

interface Props {
  posts: GridPost[]
  currentUserId: string
}

/**
 * Grilla de publicaciones estilo Instagram (cuadritos 3×N). Al tocar un
 * cuadrito se abre la PostCard completa en un modal, preservando el menú de
 * editar privacidad / eliminar del autor.
 */
export default function ProfilePostsGrid({ posts, currentUserId }: Props) {
  const [selected, setSelected] = useState<GridPost | null>(null)
  useEscapeKey(() => setSelected(null), !!selected)

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5">
        {posts.map((p) => {
          const vis = p.visibility ?? (p.is_public === false ? 'followers' : 'public')
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group relative aspect-square overflow-hidden bg-gray-900"
            >
              {p.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnail_url} alt={p.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              ) : p.video_url ? (
                <video src={p.video_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-brand-700 to-morado-flow" />
              )}
              {/* dim + play */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/30">
                <Play className="h-6 w-6 text-white/90 drop-shadow" fill="currentColor" />
              </div>
              {/* visibility badge */}
              {vis !== 'public' && (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1 backdrop-blur-sm">
                  {vis === 'friends' ? <Users className="h-3 w-3 text-white" /> : <Lock className="h-3 w-3 text-white" />}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div className="relative mt-10 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute -top-1 right-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-lg dark:bg-dark-surface2 dark:text-dark-text"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <PostCard post={selected as any} currentUserId={currentUserId} />
          </div>
        </div>
      )}
    </>
  )
}
