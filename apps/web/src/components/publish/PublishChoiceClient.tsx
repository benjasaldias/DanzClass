'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Video, ChevronRight } from 'lucide-react'
import CreatePostModal from '@/components/feed/CreatePostModal'

interface PublishChoiceClientProps {
  userId: string
  userCity: string | null
}

export default function PublishChoiceClient({ userId, userCity }: PublishChoiceClientProps) {
  const router = useRouter()
  const [showVideoModal, setShowVideoModal] = useState(false)

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

        {/* Video */}
        <button
          onClick={() => setShowVideoModal(true)}
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98] text-left"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 flex-shrink-0">
            <Video className="h-6 w-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Video</p>
            <p className="text-sm text-gray-500 mt-0.5">Comparte una coreografía con la comunidad</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        </button>
      </div>

      {showVideoModal && (
        <CreatePostModal
          userId={userId}
          userCity={userCity}
          onClose={() => setShowVideoModal(false)}
          onCreated={() => router.push('/feed')}
        />
      )}
    </div>
  )
}
