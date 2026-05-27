'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, Loader2, Globe, Lock, Users } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { createClient } from '@/lib/supabase/client'
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'
import { cn } from '@/lib/utils'

type Visibility = 'public' | 'followers' | 'friends'

interface CreatePostModalProps {
  userId: string
  userCity?: string | null
  onClose: () => void
  onCreated: (post: any) => void
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ElementType; active: string; inactive: string }[] = [
  { value: 'public', label: 'Público', icon: Globe, active: 'bg-brand-50 border-brand-200 text-brand-700', inactive: 'border-gray-200 text-gray-500' },
  { value: 'followers', label: 'Seguidores', icon: Lock, active: 'bg-gray-100 border-gray-300 text-gray-700', inactive: 'border-gray-200 text-gray-500' },
  { value: 'friends', label: 'Amigos', icon: Users, active: 'bg-purple-50 border-purple-200 text-purple-700', inactive: 'border-gray-200 text-gray-500' },
]

export default function CreatePostModal({ userId, onClose, onCreated }: CreatePostModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [videoFile, setVideoFile] = useState<{ file: File; preview: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose, !loading)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setVideoFile({ file: accepted[0], preview: URL.createObjectURL(accepted[0]) })
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    disabled: !!videoFile,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Escribe un título'); return }
    setLoading(true)
    setError(null)

    let videoUrl: string | null = null

    if (videoFile) {
      try {
        if (isCloudinaryConfigured()) {
          const result = await uploadToCloudinary(videoFile.file, 'video', 'posts')
          videoUrl = result.secure_url
        } else {
          const supabase = createClient()
          const ext = videoFile.file.name.split('.').pop()
          const path = `${userId}/${Date.now()}.${ext}`
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('posts-media')
            .upload(path, videoFile.file)
          if (uploadErr || !uploadData) throw new Error('upload_failed')
          const { data: urlData } = supabase.storage.from('posts-media').getPublicUrl(uploadData.path)
          videoUrl = urlData.publicUrl
        }
      } catch {
        setError('Error al subir el video. Intenta de nuevo.')
        setLoading(false)
        return
      }
    }

    const supabase = createClient()
    const { data: post, error: insertErr } = await supabase
      .from('posts' as any)
      .insert({
        user_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl,
        is_public: visibility === 'public',
        visibility,
      } as any)
      .select('*, user:profiles!user_id(*)')
      .single()

    if (insertErr || !post) {
      setError('Error al publicar. Intenta de nuevo.')
      setLoading(false)
      return
    }

    onCreated(post)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-dark-surface p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">Nueva coreografía</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-dark-text2 hover:text-gray-600 dark:hover:text-dark-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej: Combo de Salsa — nivel básico"
              className="input"
              maxLength={120}
            />
          </div>

          {videoFile ? (
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video src={videoFile.preview} controls className="w-full h-auto max-h-[50vh]" />
              <button
                type="button"
                onClick={() => setVideoFile(null)}
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={cn(
                'rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30' : 'border-gray-200 dark:border-dark-border hover:border-brand-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 dark:text-dark-text2/40 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-dark-text2">Arrastra o selecciona un video</p>
              <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-1">MP4, MOV, WebM</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              Descripción <span className="text-gray-400 dark:text-dark-text2/60 font-normal">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿De qué trata este video? Contexto, estilo, nivel..."
              className="input resize-none"
              rows={3}
              maxLength={280}
            />
            <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-1 text-right">{description.length}/280</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-dark-text2">Visibilidad</label>
            <div className="flex gap-2">
              {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon, active, inactive }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors',
                    visibility === value ? active : inactive
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Publicar coreografía'}
          </button>
        </form>
      </div>
    </div>
  )
}
