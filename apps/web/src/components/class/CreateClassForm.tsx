'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, DAYS_OF_WEEK } from '@danceclass/shared'
import MonthCalendar from '@/components/ui/MonthCalendar'
import type { ClassType, ClassLevel, Recurrence } from '@danceclass/shared'

const schema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  type: z.enum(['suelta', 'periodica']),
  dance_style: z.string().optional(),
  level: z.enum(['principiante', 'intermedio', 'avanzado', 'todos']),
  // One-time
  date: z.string().optional(),
  time: z.string().optional(),
  // Periodic
  recurrence: z.enum(['weekly', 'biweekly', 'custom']).optional(),
  day_of_week: z.coerce.number().min(0).max(6).optional(),
  recurring_time: z.string().optional(),
  // Common
  duration_minutes: z.coerce.number().min(30).max(240),
  location_name: z.string().optional(),
  location_address: z.string().optional(),
  city: z.string().optional(),
  max_spots: z.coerce.number().min(1).max(100),
  price: z.coerce.number().min(0),
  price_suelta: z.coerce.number().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'suelta') {
    if (!data.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Requerido para clase suelta' })
    if (!data.time) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Requerido para clase suelta' })
  } else {
    if (!data.recurrence) ctx.addIssue({ code: 'custom', path: ['recurrence'], message: 'Requerido' })
    if (!data.recurring_time) ctx.addIssue({ code: 'custom', path: ['recurring_time'], message: 'Requerido' })
    if (data.recurrence && data.recurrence !== 'custom') {
      if (data.day_of_week === undefined || data.day_of_week === null || isNaN(data.day_of_week as number)) {
        ctx.addIssue({ code: 'custom', path: ['day_of_week'], message: 'Requerido' })
      }
    }
  }
})

type FormData = z.infer<typeof schema>

interface CreateClassFormProps {
  teacherId: string
  hasPaymentInfo: boolean
}

export default function CreateClassForm({ teacherId, hasPaymentInfo }: CreateClassFormProps) {
  const router = useRouter()
  const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([])
  const [customDates, setCustomDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'suelta', level: 'todos', duration_minutes: 60 },
  })

  const classType = watch('type')
  const recurrence = watch('recurrence')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.slice(0, 5 - mediaFiles.length).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    setMediaFiles((prev) => [...prev, ...newFiles])
  }, [mediaFiles.length])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    maxFiles: 5,
    disabled: mediaFiles.length >= 5,
  })

  function removeMedia(index: number) {
    URL.revokeObjectURL(mediaFiles[index].preview)
    setMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(data: FormData) {
    if (data.type === 'periodica' && data.recurrence === 'custom' && customDates.length === 0) {
      setError('Selecciona al menos una fecha en el calendario')
      return
    }

    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    const { data: classRecord, error: classError } = await supabase
      .from('classes')
      .insert({
        teacher_id: teacherId,
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
        status: 'active',
      })
      .select()
      .single()

    if (classError || !classRecord) {
      setError('Error al crear la clase. Intenta de nuevo.')
      setSubmitting(false)
      return
    }

    let mediaError = false
    for (let i = 0; i < mediaFiles.length; i++) {
      const { file, type } = mediaFiles[i]
      const ext = file.name.split('.').pop()
      const path = `${classRecord.id}/${i}.${ext}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('class-media')
        .upload(path, file)

      if (uploadErr || !uploadData) {
        console.error('Media upload error:', uploadErr)
        mediaError = true
        continue
      }

      const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
      const { error: mediaInsertErr } = await supabase.from('class_media').insert({
        class_id: classRecord.id,
        type,
        url: urlData.publicUrl,
        order_index: i,
      })
      if (mediaInsertErr) {
        console.error('class_media insert error:', mediaInsertErr)
        mediaError = true
      }
    }

    if (mediaError) {
      setError('La clase se creó correctamente, pero hubo un error al subir algunos archivos multimedia.')
    }

    // Notify all followers about the new class
    const { data: followers } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', teacherId)

    if (followers && followers.length > 0) {
      await supabase.from('notifications').insert(
        followers.map((f) => ({
          user_id: f.follower_id,
          type: 'new_class',
          data: { class_id: classRecord.id, class_title: data.title },
        }))
      )
    }

    setSubmitting(false)
    router.push(`/class/${classRecord.id}`)
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Publicar clase</h1>
      <p className="text-sm text-gray-500 mb-5">Comparte los detalles de tu clase</p>

      {!hasPaymentInfo && (
        <div className="mb-4 rounded-xl bg-yellow-50 border border-yellow-200 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Configura tus datos bancarios</p>
            <p className="text-xs text-yellow-700 mt-0.5">Los estudiantes necesitarán tus datos para pagarte.</p>
          </div>
        </div>
      )}

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
                <span className="text-xs text-gray-500">
                  {t === 'suelta' ? 'Una fecha específica' : 'Varias fechas o recurrente'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Título *</label>
          <input {...register('title')} placeholder="ej: Clases de Salsa — Nivel básico" className="input" />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Descripción</label>
          <textarea {...register('description')} rows={4} placeholder="Describe la clase, qué aprenderán, requisitos previos..." className="input resize-none" />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>

        {/* Dance style + Level */}
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

            {/* Semanal / Quincenal: pick day + time */}
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

            {/* Custom: calendar + time */}
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

            {/* Price suelta — optional for any periodic class */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Precio clase suelta <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <p className="text-xs text-gray-400">Si los alumnos también pueden pagar solo una clase, indica su precio</p>
              <input
                {...register('price_suelta')}
                type="number"
                min={0}
                placeholder="ej: 5000"
                className="input mt-1"
              />
              {errors.price_suelta && <p className="mt-1 text-xs text-red-600">{errors.price_suelta.message}</p>}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Lugar</label>
            <input {...register('location_name')} placeholder="ej: Estudio Dance House" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Dirección</label>
            <input {...register('location_address')} placeholder="ej: Av. Providencia 1234, Santiago" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad</label>
            <input {...register('city')} placeholder="Santiago, Valparaíso..." className="input" />
          </div>
        </div>

        {/* Spots + Duration + Price */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cupos *</label>
            <input {...register('max_spots')} type="number" min={1} placeholder="15" className="input" />
            {errors.max_spots && <p className="mt-1 text-xs text-red-600">{errors.max_spots.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Duración (min)</label>
            <input {...register('duration_minutes')} type="number" min={30} placeholder="60" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {classType === 'periodica' ? 'Precio mensual ($) *' : 'Precio ($) *'}
            </label>
            <input {...register('price')} type="number" min={0} placeholder="15000" className="input" />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
          </div>
        </div>

        {/* Media upload */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Fotos/Videos <span className="text-gray-400 font-normal">(máx. 5)</span>
          </label>

          {mediaFiles.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {mediaFiles.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {m.type === 'image'
                    ? <img src={m.preview} className="w-full h-full object-cover" alt="" />
                    : <video src={m.preview} className="w-full h-full object-cover" />
                  }
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mediaFiles.length < 5 && (
            <div
              {...getRootProps()}
              className={cn(
                'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Arrastra o selecciona fotos/videos</p>
              <p className="text-xs text-gray-400 mt-1">Tip: agrega una imagen con los precios</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Publicando...
            </span>
          ) : 'Publicar clase'}
        </button>
      </form>
    </div>
  )
}
