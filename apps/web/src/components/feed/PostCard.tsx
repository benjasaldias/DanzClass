'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, Users, Flag } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import ReportModal from '@/components/ui/ReportModal'

interface PostCardProps {
  post: {
    id: string
    title: string
    video_url: string | null
    thumbnail_url: string | null
    is_public?: boolean
    visibility?: 'public' | 'followers' | 'friends'
    city: string | null
    created_at: string
    user: {
      id: string
      full_name: string
      username: string
      avatar_url: string | null
    }
  }
  currentUserId?: string
}

const VISIBILITY_LABELS: Record<string, { icon: React.ElementType; label: string }> = {
  followers: { icon: Lock, label: 'Solo seguidores' },
  friends: { icon: Users, label: 'Solo amigos' },
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const [showReport, setShowReport] = useState(false)

  const user = post.user
  const visibility = post.visibility ?? (post.is_public === false ? 'followers' : 'public')
  const privacyInfo = VISIBILITY_LABELS[visibility]
  const canReport = !!currentUserId && currentUserId !== user.id

  return (
    <>
      <div className="border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href={`/teacher/${user.username}`}>
            <Avatar src={user.avatar_url} name={user.full_name} size="md" />
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/teacher/${user.username}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600">
              {user.full_name}
            </Link>
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span>@{user.username}</span>
              <span>·</span>
              <span>{formatDate(post.created_at)}</span>
              {post.city && <><span>·</span><span>{post.city}</span></>}
              {privacyInfo && (
                <span className="flex items-center gap-0.5">
                  <privacyInfo.icon className="h-3 w-3" /> {privacyInfo.label}
                </span>
              )}
            </div>
          </div>
          {canReport && (
            <button
              onClick={() => setShowReport(true)}
              className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors p-1"
              aria-label="Reportar publicación"
            >
              <Flag className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-900 mb-3">{post.title}</p>

        {post.video_url && (
          <div className="rounded-xl overflow-hidden bg-black">
            <video
              src={post.video_url}
              controls
              preload="metadata"
              playsInline
              className="w-full h-auto max-h-[85vh]"
              poster={post.thumbnail_url ?? undefined}
            />
          </div>
        )}
      </div>

      {showReport && currentUserId && (
        <ReportModal
          contentType="post"
          contentId={post.id}
          reporterId={currentUserId}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  )
}
