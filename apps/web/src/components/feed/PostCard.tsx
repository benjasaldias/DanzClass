'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Users, Flag, MoreVertical, Globe, Trash2, Pencil, Loader2, Clapperboard } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ReportModal from '@/components/ui/ReportModal'

type Visibility = 'public' | 'followers' | 'friends'

interface PostCardProps {
  post: {
    id: string
    title: string
    video_url: string | null
    thumbnail_url: string | null
    is_public?: boolean
    visibility?: Visibility
    city?: string | null
    description?: string | null
    class_id?: string | null
    tagged_class?: {
      id: string
      title: string
      teacher: { username: string; full_name: string }
    } | null
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

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ElementType }[] = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'followers', label: 'Seguidores', icon: Lock },
  { value: 'friends', label: 'Amigos', icon: Users },
]

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const router = useRouter()
  const [showReport, setShowReport] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showEditVisibility, setShowEditVisibility] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>(
    post.visibility ?? (post.is_public === false ? 'followers' : 'public')
  )
  const menuRef = useRef<HTMLDivElement>(null)

  const user = post.user
  const privacyInfo = VISIBILITY_LABELS[visibility]
  const isAuthor = !!currentUserId && currentUserId === user.id
  const canReport = !!currentUserId && !isAuthor

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowOptions(false)
      }
    }
    if (showOptions) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showOptions])

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await (supabase as any).from('posts').delete().eq('id', post.id)
    setDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleVisibilityChange(newVisibility: Visibility) {
    setSavingVisibility(true)
    const supabase = createClient()
    await (supabase as any).from('posts').update({
      visibility: newVisibility,
      is_public: newVisibility === 'public',
    }).eq('id', post.id)
    setVisibility(newVisibility)
    setSavingVisibility(false)
    setShowEditVisibility(false)
    setShowOptions(false)
  }

  return (
    <>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Eliminar publicación"
          message={`¿Eliminar "${post.title}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          destructive
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <div className="border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href={`/teacher/${user.username}`}>
            <Avatar src={user.avatar_url} name={user.full_name} size="md" />
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/teacher/${user.username}`} className="text-sm font-semibold text-gray-900 dark:text-dark-text hover:text-brand-600 dark:hover:text-brand-300">
              {user.full_name}
            </Link>
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-dark-text2 flex-wrap">
              <span>@{user.username}</span>
              <span>·</span>
              <span>{formatDate(post.created_at)}</span>
              {privacyInfo && (
                <span className="flex items-center gap-0.5">
                  <privacyInfo.icon className="h-3 w-3" /> {privacyInfo.label}
                </span>
              )}
            </div>
          </div>

          {isAuthor && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="text-gray-400 dark:text-dark-text2 hover:text-gray-600 dark:hover:text-dark-text transition-colors p-1"
                aria-label="Opciones"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showOptions && !showEditVisibility && (
                <div className="absolute right-0 top-7 z-20 w-48 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 shadow-lg py-1">
                  <button
                    onClick={() => setShowEditVisibility(true)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-gray-400 dark:text-dark-text2" />
                    Editar privacidad
                  </button>
                  <button
                    onClick={() => { setShowOptions(false); setShowDeleteConfirm(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              )}
              {showOptions && showEditVisibility && (
                <div className="absolute right-0 top-7 z-20 w-52 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface2 shadow-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-dark-text2 mb-2 px-1">Visibilidad</p>
                  <div className="space-y-1">
                    {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => handleVisibilityChange(value)}
                        disabled={savingVisibility}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                          visibility === value
                            ? 'bg-brand-50 dark:bg-dark-surface text-brand-700 dark:text-brand-300 font-medium'
                            : 'text-gray-700 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface'
                        }`}
                      >
                        {savingVisibility && visibility !== value ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowEditVisibility(false)}
                    className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 text-center py-1"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

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

        <p className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">{post.title}</p>

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

        {post.description && (
          <p className="mt-3 text-sm text-gray-700 dark:text-dark-text2 leading-relaxed">{post.description}</p>
        )}

        {post.tagged_class && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#EEEDFE] dark:border-dark-border bg-[#F5F3FF] dark:bg-dark-surface2 px-3 py-2">
            <Clapperboard className="h-3.5 w-3.5 text-[#7F77DD] flex-shrink-0" />
            <p className="text-sm text-gray-700 dark:text-dark-text2 min-w-0 truncate">
              {post.tagged_class.title}
              <span className="mx-1 text-gray-400 dark:text-dark-text2/60">·</span>
              <Link
                href={`/teacher/${post.tagged_class.teacher.username}`}
                className="text-[#7F77DD] hover:underline font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                @{post.tagged_class.teacher.username}
              </Link>
            </p>
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
