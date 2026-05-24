'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Video, ChevronRight, Lock, Music2 } from 'lucide-react'
import CreatePostModal from '@/components/feed/CreatePostModal'
import CreateRehearsalModal from '@/components/rehearsal/CreateRehearsalModal'
import { BASIC_VIDEO_POST_LIMIT, canPostVideo } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface PublishChoiceClientProps {
  userId: string
  userCity: string | null
  tier: SubscriptionTier
  videoPostCount: number
}

export default function PublishChoiceClient({ userId, userCity, tier, videoPostCount }: PublishChoiceClientProps) {
  const router = useRouter()
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showVideoLimit, setShowVideoLimit] = useState(false)
  const [showRehearsalModal, setShowRehearsalModal] = useState(false)

  const canVideo = canPostVideo(tier)
  const isBasic = tier === 'basic'
  const atLimit = isBasic && videoPostCount >= BASIC_VIDEO_POST_LIMIT

  function handleVideoClick() {
    if (!canVideo) return
    if (atLimit) { setShowVideoLimit(true); return }
    setShowVideoModal(true)
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Publicar</h1>
      <p className="text-sm text-gray-500 mb-8">¿Qué quieres publicar hoy?</p>

      <div className="flex flex-col gap-4">
        {/* Clase */}
        <Link
          href="/create-class"
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 flex-shrink-0">
            <Calendar className="h-6 w-6 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Clase</p>
            <p className="text-sm text-gray-500 mt-0.5">Suelta o periódica, con cupos e inscripciones</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        </Link>

        {/* Ensayo */}
        <button
          onClick={() => setShowRehearsalModal(true)}
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white dark:bg-dark-surface dark:border-dark-border p-5 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] text-left w-full"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEEDFE] dark:bg-dark-surface2 flex-shrink-0">
            <Music2 className="h-6 w-6 text-[#7F77DD]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-dark-text">Ensayo</p>
            <p className="text-sm text-gray-500 dark:text-dark-text2 mt-0.5">Privado, por invitación, sin precio</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text2 flex-shrink-0" />
        </button>

        {/* Video */}
        {canVideo ? (
          <button
            onClick={handleVideoClick}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] text-left"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 flex-shrink-0">
              <Video className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">Video</p>
                {isBasic && (
                  <span className="text-xs text-gray-400 font-normal">{videoPostCount}/{BASIC_VIDEO_POST_LIMIT}</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">Comparte una coreografía con la comunidad</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5 opacity-60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 flex-shrink-0">
              <Video className="h-6 w-6 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-500">Video</p>
                <Lock className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Disponible desde el plan Básico</p>
            </div>
            <Link href="/plans" className="text-xs font-semibold text-brand-600 flex-shrink-0">Ver planes</Link>
          </div>
        )}
      </div>

      {/* Limit reached message */}
      {showVideoLimit && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">Límite de videos alcanzado</p>
          <p className="text-sm text-amber-700">
            El plan Básico permite hasta {BASIC_VIDEO_POST_LIMIT} videos publicados simultáneamente.
            Elimina uno desde tu perfil para subir otro.
          </p>
          <div className="flex gap-2 pt-1">
            <Link href="/profile" className="text-sm font-semibold text-amber-800 underline underline-offset-2">
              Ir a mi perfil
            </Link>
            <span className="text-amber-400">·</span>
            <Link href="/plans" className="text-sm font-semibold text-brand-600 underline underline-offset-2">
              Ver plan Pro
            </Link>
          </div>
        </div>
      )}

      {showVideoModal && (
        <CreatePostModal
          userId={userId}
          userCity={userCity}
          onClose={() => setShowVideoModal(false)}
          onCreated={() => router.push('/feed')}
        />
      )}

      {showRehearsalModal && (
        <CreateRehearsalModal
          onClose={() => setShowRehearsalModal(false)}
          onCreated={() => router.push('/feed?tab=rehearsals')}
        />
      )}
    </div>
  )
}
