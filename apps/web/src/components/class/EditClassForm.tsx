'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Upload, X, Loader2, Music2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, DAYS_OF_WEEK } from '@danceclass/shared'
import MonthCalendar from '@/components/ui/MonthCalendar'
import type { ClassType, ClassLevel } from '@danceclass/shared'

const schema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  type: z.enum(['suelta', 'periodica']),
  dance_style: z.string().optional(),
  level: z.enum(['principiante', 'intermedio', 'avanzado', 'todos']),
  date: z.string().optional(),
  time: z.string().optional(),
  recurrence: z.enum(['weekly', 'biweekly', 'monthly', 'custom']).optional(),
  day_of_week: z.coerce.number().min(0).max(6).optional(),
  recurring_time: z.string().optional(),
  duration_minutes: z.coerce.number().min(30).max(240),
  location_name: z.string().optional(),
  location_address: z.string().optional(),
  city: z.string().optional(),
  max_spots: z.coerce.number().min(1).max(100),
  price: z.coerce.number().min(0),
  price_suelta: z.coerce.number().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'suelta') {
    if (!data.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Requerido' })
    if (!data.time) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Requerido' })
  } else {
    if (!data.recurrence) ctx.addIssue({ code: 'custom', path: ['recurrence'], message: 'Requerido' })
    if (!data.recurring_time) ctx.addIssue({ code: 'custom', path: ['recurring_time'], message: 'Requerido' })
    if (data.recurrence && data.recurrence !== 'custom') {
      if (data.day_of_week === undefined || isNaN(data.day_of_week as number)) {
        ctx.addIssue({ code: 'custom', path: ['day_of_week'], message: 'Requerido' })
      }
    }
  }
})

type FormData = z.infer<typeof schema>

interface ExistingMedia {
  id: string
  url: string
  type: 'image' | 'video'
  order_index: number
}

interface EditClassFormProps {
  classData: any
}

export default function EditClassForm({ classData }: EditClassFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(
    [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  )
  const [newMediaFiles, setNewMediaFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([])
  const [customDates, setCustomDates] = useState<string[]>(classData.custom_dates ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalMedia = existingMedia.length + newMediaFiles.length

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: classData.type,
      level: classData.level,
      duration_minutes: classData.duration_minutes,
      title: classData.title,
      description: classData.description ?? '',
      dance_style: classData.dance_style ?? '',
      date: classData.date ?? '',
      time: classData.time ?? '',
      recurrence: classData.recurrence ?? undefined,
      day_of_week: classData.day_of_week ?? undefined,
      recurring_time: classData.recurring_time ?? '',
      location_name: classData.location_name ?? '',
      location_address: classData.location_address ?? '',
      city: classData.city ?? '',
      max_spots: classData.max_spots,
      price: classData.price,
      price_suelta: classData.price_suelta ?? undefined,
    },
  })

  const classType = watch('type')
  const recurrence = watch('recurrence')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const slots = 5 - totalMedia
    const newFiles = acceptedFiles.slice(0, slots).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    setNewMediaFiles((prev) => [...prev, ...newFiles])
  }, [totalMedia])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    maxFiles: 5,
    disabled: totalMedia >= 5,
  })

  async function removeExistingMedia(media: ExistingMedia) {
    await supabase.from('class_media').delete().eq('id', media.id)
    setExistingMedia((prev) => prev.filter((m) => m.id !== media.id))
  }

  function removeNewMedia(index: number) {
    URL.revokeObjectURL(newMediaFiles[index].preview)
    setNewMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function notifyEnrolledStudents(classTitle: string, type: 'class_updated' | 'class_cancelled') {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('class_id', classData.id)
      .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])

    if (enrollments && enrollments.length > 0) {
      await supabase.from('notifications').insert(
        enrollments.map((e: any) => ({
          user_id: e.student_id,
          type,
          data: { class_id: classData.id, class_title: classTitle },
        }))
      )
    }
  }

  async function onSubmit(data: FormData) {
    if (data.type === 'periodica' && data.recurrence === 'custom' && customDates.length === 0) {
      setError('Selecciona al menos una fecha en el calendario')
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('classes')
      .update({
        title: data.title,
        description: data.description || null,
        type: data.type,
        dance_style: data.dance_style || null,
        level: data.level,
        date: data.type === 'suelta' ? data.date : null,
        time: data.type === 'suelta' ? data.time : null,
        recurrence: data.type === 'periodica' ? data.recurrence : null,
        day_of_week: data.type === 'periodica' && data.recurrence !== 'custom' ? data.day_of_week : null,
        recurring_time: data.type === 'periodica' ? data.recurring_time : null,
        custom_dates: data.type === 'periodica' && data.recurrence === 'custom' ? customDates : [],
        duration_minutes: data.duration_minutes,
        location_name: data.location_name || null,
        location_address: data.location_address || null,
        city: data.city || null,
        max_spots: data.max_spots,
        price: data.price,
        price_suelta: data.type === 'periodica' && data.price_suelta ? data.price_suelta : null,
      })
      .eq('id', classData.id)

    if (updateError) {
      setError('Error al guardar los cambios. Intenta de nuevo.')
      setSubmitting(false)
      return
    }

    // Upload new media files
    const nextIndex = existingMedia.length
    for (let i = 0; i < newMediaFiles.length; i++) {
      const { file, type } = newMediaFiles[i]
      const ext = file.name.split('.').pop()
      const path = `${classData.id}/${nextIndex + i}.${ext}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('class-media')
        .upload(path, file)

      if (!uploadErr && uploadData) {
        const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
        await supabase.from('class_media').insert({
          class_id: classData.id,
          type,
          url: urlData.publicUrl,
          order_index: nextIndex + i,
        })
      } else {
        console.error('Upload error:', uploadErr)
      }
    }

    // Notify enrolled students
    await notifyEnrolledStudents(data.title, 'class_updated')

    setSubmitting(false)
    router.push(`/class/${classData.id}`)
    router.refresh()
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Editar clase</h1>
      <p className="text-sm text-gray-500 mb-5">Los inscritos serán notificados de los cambios</p>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Type selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Tipo de clase</label>
          <div className="grid grid-cols-2 gap-3">
            {(['suelta', 'periodica'] as ClassType[]).map((t) => (
              <label key={t} className={cn(
                'flex flex-col gap-1 rounded-xl border-2 p-3 cursor-pointer transition-colors',
                classType === t ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
              )}>
                <input type="radio" value={t} {...register('type')} className="sr-only" />
                <span className="font-semibold text-sm capitalize">
                  {t === 'suelta' ? 'Clase suelta' : 'Periódica'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Título *</label>
          <input {...register('title')} className="input" />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Descripción</label>
          <textarea {...register('description')} rows={4} className="input resize-none" />
        </div>

        {/* Style + Level */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Estilo</label>
            <select {...register('dance_style')} className="input">
              <option value="">Seleccionar</option>
              {DANCE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nivel</label>
            <select {...register('level')} className="input">
              {(['todos', 'principiante', 'intermedio', 'avanzado'] as ClassLevel[]).map((l) => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule - One-time */}
        {classType === 'suelta' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Fecha *</label>
              <input {...register('date')} type="date" className="input" />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Hora *</label>
              <input {...register('time')} type="time" className="input" />
              {errors.time && <p className="mt-1 text-xs text-red-600">{errors.time.message}</p>}
            </div>
          </div>
        )}

        {/* Schedule - Periodic */}
        {classType === 'periodica' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Periodicidad *</label>
              <select {...register('recurrence')} className="input">
                <option value="">Seleccionar</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="custom">Personalizado (fechas específicas)</option>
              </select>
              {errors.recurrence && <p className="mt-1 text-xs text-red-600">{errors.recurrence.message}</p>}
            </div>

            {recurrence && recurrence !== 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Día *</label>
                  <select {...register('day_of_week')} className="input">
                    <option value="">Seleccionar</option>
                    {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  {errors.day_of_week && <p className="mt-1 text-xs text-red-600">{errors.day_of_week.message}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Hora *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                  {errors.recurring_time && <p className="mt-1 text-xs text-red-600">{errors.recurring_time.message}</p>}
                </div>
              </div>
            )}

            {recurrence === 'custom' && (
              <div className="space-y-3">
                <MonthCalendar selected={customDates} onChange={setCustomDates} />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Hora de inicio *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                  {errors.recurring_time && <p className="mt-1 text-xs text-red-600">{errors.recurring_time.message}</p>}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Precio clase suelta <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input {...register('price_suelta')} type="number" min={0} placeholder="ej: 5000" className="input mt-1" />
            </div>
          </div>
        )}

        {/* Location */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Lugar</label>
            <input {...register('location_name')} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Dirección</label>
            <input {...register('location_address')} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad</label>
            <input {...register('city')} className="input" />
          </div>
        </div>

        {/* Spots + Duration + Price */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cupos *</label>
            <input {...register('max_spots')} type="number" min={1} className="input" />
            {errors.max_spots && <p className="mt-1 text-xs text-red-600">{errors.max_spots.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Duración (min)</label>
            <input {...register('duration_minutes')} type="number" min={30} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {classType === 'periodica' ? 'Precio mensual ($) *' : 'Precio ($) *'}
            </label>
            <input {...register('price')} type="number" min={0} className="input" />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
          </div>
        </div>

        {/* Media */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Fotos/Videos <span className="text-gray-400 font-normal">(máx. 5)</span>
          </label>

          {/* Existing media */}
          {existingMedia.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {existingMedia.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {m.type === 'image'
                    ? <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                    : <video src={m.url} className="w-full h-full object-cover" />
                  }
                  <button
                    type="button"
                    onClick={() => removeExistingMedia(m)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1"
                  >
                    <Trash2 className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New media previews */}
          {newMediaFiles.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {newMediaFiles.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 ring-2 ring-brand-400">
                  {m.type === 'image'
                    ? <img src={m.preview} className="w-full h-full object-cover" alt="" />
                    : <video src={m.preview} className="w-full h-full object-cover" />
                  }
                  <button
                    type="button"
                    onClick={() => removeNewMedia(i)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalMedia < 5 && (
            <div
              {...getRootProps()}
              className={cn(
                'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Arrastra o selecciona fotos/videos nuevos</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </span>
          ) : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
