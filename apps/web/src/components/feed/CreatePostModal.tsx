'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, Loader2, Globe, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CityCombobox from '@/components/ui/CityCombobox'
import { cn } from '@/lib/utils'

interface CreatePostModalProps {
  userId: string
  userCity: string | null
  onClose: () => void
  onCreated: (post: any) => void
}

export default function CreatePostModal({ userId, userCity, onClose, onCreated }: CreatePostModalProps) {
  const [title, setTitle] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [city, setCity] = useState(userCity ?? '')
  const [videoFile, setVideoFile] = useState<{ file: File; preview: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    const supabase = createClient()
    let videoUrl: string | null = null

    if (videoFile) {
      const ext = videoFile.file.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('posts-media')
        .upload(path, videoFile.file)

      if (uploadErr || !uploadData) {
        setError('Error al subir el video. Intenta de nuevo.')
        setLoading(false)
        return
      }
      const { data: urlData } = supabase.storage.from('posts-media').getPublicUrl(uploadData.path)
      videoUrl = urlData.publicUrl
    }

    const { data: post, error: insertErr } = await supabase
      .from('posts' as any)
      .insert({
        user_id: userId,
        title: title.trim(),
        video_url: videoUrl,
        is_public: isPublic,
        city: city || null,
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
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">Nueva coreografía</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej: Combo de Salsa — nivel básico"
              className="input"
              maxLength={120}
            />
          </div>

          {/* Video */}
          {videoFile ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video src={videoFile.preview} controls className="w-full h-full object-contain" />
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
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Arrastra o selecciona un video</p>
              <p className="text-xs text-gray-400 mt-1">MP4, MOV, WebM (máx. 100MB)</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad</label>
            <CityCombobox value={city} onChange={setCity} />
          </div>

          {/* Visibilidad */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors',
                isPublic ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-gray-200 text-gray-500')}
            >
              <Globe className="h-3.5 w-3.5" /> Público
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors',
                !isPublic ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-500')}
            >
              <Lock className="h-3.5 w-3.5" /> Solo seguidores
            </button>
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
