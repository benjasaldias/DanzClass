'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, Loader2, Video } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendNotifications } from '@/lib/notifications'

interface AuditionModalProps {
  classId: string
  userId: string
  teacherId: string
  onClose: () => void
  onSubmitted: () => void
}

export default function AuditionModal({ classId, userId, teacherId, onClose, onSubmitted }: AuditionModalProps) {
  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [phone, setPhone] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) setVideoFile(acceptedFiles[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    maxSize: 104857600,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('El nombre completo es requerido'); return }

    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    let videoUrl: string | null = null

    if (videoFile) {
      const ext = videoFile.name.split('.').pop()
      const path = `${userId}/${classId}.${ext}`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('audition-videos')
        .upload(path, videoFile, { upsert: true })

      if (uploadErr || !uploadData) {
        setError('Error al subir el video. Intenta de nuevo.')
        setSubmitting(false)
        return
      }

      // Store the storage path (not a public URL) — bucket is private, signed URLs used on view
      videoUrl = uploadData.path
    }

    const { error: insertErr } = await (supabase as any).from('auditions').insert({
      class_id: classId,
      applicant_id: userId,
      full_name: fullName.trim(),
      age: age ? parseInt(age) : null,
      phone: phone.trim() || null,
      video_url: videoUrl,
      status: 'pending',
    })

    if (insertErr) {
      setError(insertErr.message.includes('unique') ? 'Ya tienes una postulación enviada' : 'Error al enviar. Intenta de nuevo.')
    } else {
      // Notify the teacher about the new application
      await sendNotifications({
        user_id: teacherId,
        type: 'new_audition',
        data: { from_user_id: userId, class_id: classId },
      })
      onSubmitted()
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl bg-white dark:bg-dark-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-dark-text">Postularme al entrenamiento</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
            <X className="h-4 w-4 text-gray-500 dark:text-dark-text2" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Nombre completo *</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
                Edad <span className="text-gray-400 dark:text-dark-text2/60 font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="25"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
                Teléfono <span className="text-gray-400 dark:text-dark-text2/60 font-normal">(opcional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              Video bailando <span className="text-gray-400 dark:text-dark-text2/60 font-normal">(opcional, máx. 100MB)</span>
            </label>
            {videoFile ? (
              <div className="flex items-center gap-3 rounded-xl border border-brand-200 dark:border-dark-border bg-brand-50 dark:bg-dark-surface2 px-3 py-2.5">
                <Video className="h-5 w-5 text-brand-600 dark:text-brand-300 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-dark-text2 truncate flex-1">{videoFile.name}</span>
                <button
                  type="button"
                  onClick={() => setVideoFile(null)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-brand-400 bg-brand-50 dark:bg-dark-surface2' : 'border-gray-200 dark:border-dark-border hover:border-brand-300'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-6 w-6 text-gray-300 dark:text-dark-border mx-auto mb-1.5" />
                <p className="text-sm text-gray-500 dark:text-dark-text2">Arrastra o selecciona un video</p>
                <p className="text-xs text-gray-400 dark:text-dark-text2/60 mt-0.5">MP4, MOV, WebM — privado, solo el profesor lo verá</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3 text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </span>
            ) : 'Enviar postulación'}
          </button>
        </form>
      </div>
    </div>
  )
}
