'use client'

import Link from 'next/link'
import { Play, Globe, Lock } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'

interface PostCardProps {
  post: {
    id: string
    title: string
    video_url: string | null
    thumbnail_url: string | null
    is_public: boolean
    city: string | null
    created_at: string
    user: {
      id: string
      full_name: string
      username: string
      avatar_url: string | null
    }
  }
}

export default function PostCard({ post }: PostCardProps) {
  const user = post.user

  return (
    <div className="border-b border-gray-100 px-4 py-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/teacher/${user.username}`}>
          <Avatar src={user.avatar_url} name={user.full_name} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/teacher/${user.username}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600">
            {user.full_name}
          </Link>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>@{user.username}</span>
            <span>·</span>
            <span>{formatDate(post.created_at)}</span>
            {post.city && <><span>·</span><span>{post.city}</span></>}
            {!post.is_public && (
              <span className="flex items-center gap-0.5 text-gray-400">
                <Lock className="h-3 w-3" /> Solo seguidores
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-900 mb-3">{post.title}</p>

      {post.video_url && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <video
            src={post.video_url}
            controls
            preload="metadata"
            className="w-full h-full object-contain"
            poster={post.thumbnail_url ?? undefined}
          />
        </div>
      )}
    </div>
  )
}
