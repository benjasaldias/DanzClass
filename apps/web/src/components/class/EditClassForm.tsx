'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Upload, X, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, DAYS_OF_WEEK } from '@danceclass/shared'
import MonthCalendar from '@/components/ui/MonthCalendar'
import CityCombobox from '@/components/ui/CityCombobox'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import DateInput from '@/components/ui/DateInput'
import type { ClassLevel } from '@danceclass/shared'

const schema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  type: z.enum(['suelta', 'periodica', 'entrenamiento']),
  dance_style: z.string().optional(),
  class_type: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['coreografía', 'freestyle', 'otro']).optional()
  ),
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
  price_2x: z.coerce.number().min(0).optional(),
  price_suelta_2x: z.coerce.number().min(0).optional(),
  ends_at: z.string().optional(),
  ends_indefinitely: z.boolean().optional(),
  billing_day: z.coerce.number().int().min(1).max(27).optional(),
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
    if (data.type === 'periodica' && !data.ends_at) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Las clases periódicas requieren fecha de término' })
    }
    if (data.type === 'entrenamiento' && !data.ends_at && !data.ends_indefinitely) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Indica fecha de término o marca como Indefinido' })
    }
    if (data.date && data.ends_at && data.ends_at <= data.date) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'La fecha de término debe ser posterior a la fecha de inicio' })
    }
  }
})

type FormData = z.infer<typeof schema>

interface ExistingMedia {
  id: string; url: string; type: 'image' | 'video'; order_index: number
}

interface EditClassFormProps { classData: any }

export default function EditClassForm({ classData }: EditClassFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const isEntrenamiento = classData.type === 'entrenamiento'
  const isPeriodic = classData.type === 'periodica' || isEntrenamiento

  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(
    [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  )
  const [newMediaFiles, setNewMediaFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([])
  const [customDates, setCustomDates] = useState<string[]>(classData.custom_dates ?? [])
  const [cityValue, setCityValue] = useState<string>(classData.city ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showIndefinitePopup, setShowIndefinitePopup] = useState(false)

  const totalMedia = existingMedia.length + newMediaFiles.length

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: classData.type,
      level: classData.level,
      duration_minutes: classData.duration_minutes,
      title: classData.title,
      description: classData.description ?? '',
      dance_style: classData.dance_style ?? '',
      class_type: classData.class_type ?? undefined,
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
      price_2x: classData.price_2x ?? undefined,
      price_suelta_2x: classData.price_suelta_2x ?? undefined,
      ends_at: classData.ends_at ?? undefined,
      ends_indefinitely: classData.ends_indefinitely ?? false,
      billing_day: classData.billing_day ?? 1,
    },
  })

  const classType = watch('type')
  const recurrence = watch('recurrence')
  const endsIndefinitely = watch('ends_indefinitely')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const slots = 5 - totalMedia
    const newFiles = acceptedFiles.slice(0, slots).map((file) => ({
      file, preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    setNewMediaFiles((prev) => [...prev, ...newFiles])
  }, [totalMedia])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'video/*': [] }, maxFiles: 5, disabled: totalMedia >= 5,
  })

  async function removeExistingMedia(media: ExistingMedia) {
    await supabase.from('class_media').delete().eq('id', media.id)
    setExistingMedia((prev) => prev.filter((m) => m.id !== media.id))
  }

  function removeNewMedia(index: number) {
    URL.revokeObjectURL(newMediaFiles[index].preview)
    setNewMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleIndefiniteChange(checked: boolean) {
    if (checked && classType === 'periodica') { setShowIndefinitePopup(true); return }
    setValue('ends_indefinitely', checked)
    if (checked) setValue('ends_at', undefined)
  }

  async function notifyEnrolledStudents(classTitle: string, type: 'class_updated' | 'class_cancelled') {
    const { data: enrollments } = await supabase
      .from('enrollments').select('student_id').eq('class_id', classData.id)
      .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])
    if (enrollments && enrollments.length > 0) {
      await supabase.from('notifications').insert(
        enrollments.map((e: any) => ({ user_id: e.student_id, type, data: { class_id: classData.id, class_title: classTitle } }))
      )
    }
  }

  async function onSubmit(data: FormData) {
    if (isPeriodic && data.recurrence === 'custom' && customDates.length === 0) {
      setError('Selecciona al menos una fecha en el calendario'); return
    }
    setSubmitting(true); setError(null)

    // Backfill start_date if missing and class is periodic
    let start_date_value: string | null | undefined = undefined
    if (isPeriodic && data.recurrence !== 'custom' && data.day_of_week != null && !classData.start_date) {
      const today = new Date()
      const targetDay = data.day_of_week as number
      const diff = (targetDay - today.getDay() + 7) % 7
      const sd = new Date(today)
      sd.setDate(today.getDate() + diff)
      const y = sd.getFullYear()
      const m = String(sd.getMonth() + 1).padStart(2, '0')
      const d = String(sd.getDate()).padStart(2, '0')
      start_date_value = `${y}-${m}-${d}`
    }

    const { error: updateError } = await supabase.from('classes').update({
      title: data.title,
      description: data.description || null,
      type: data.type,
      dance_style: data.dance_style || null,
      class_type: data.class_type || null,
      level: data.level,
      date: data.type === 'suelta' ? data.date : null,
      time: data.type === 'suelta' ? data.time : null,
      recurrence: isPeriodic ? data.recurrence : null,
      ...(start_date_value !== undefined && { start_date: start_date_value }),
      day_of_week: isPeriodic && data.recurrence !== 'custom' ? data.day_of_week : null,
      recurring_time: isPeriodic ? data.recurring_time : null,
      custom_dates: isPeriodic && data.recurrence === 'custom' ? customDates : [],
      duration_minutes: data.duration_minutes,
      location_name: data.location_name || null,
      location_address: data.location_address || null,
      city: cityValue || null,
      max_spots: data.max_spots,
      price: data.price,
      price_suelta: (classType === 'periodica' && data.price_suelta) ? data.price_suelta : null,
      price_2x: data.price_2x || null,
      price_suelta_2x: (classType === 'periodica' && data.price_suelta_2x) ? data.price_suelta_2x : null,
      ends_at: isPeriodic && !data.ends_indefinitely ? (data.ends_at || null) : null,
      ends_indefinitely: isEntrenamiento ? (data.ends_indefinitely ?? false) : false,
      billing_day: isEntrenamiento ? (data.billing_day ?? 1) : null,
    } as any).eq('id', classData.id)

    if (updateError) { setError('Error al guardar los cambios.'); setSubmitting(false); return }

    const nextIndex = existingMedia.length
    for (let i = 0; i < newMediaFiles.length; i++) {
      const { file, type } = newMediaFiles[i]
      const ext = file.name.split('.').pop()
      const path = `${classData.id}/${nextIndex + i}.${ext}`
      const { data: uploadData, error: uploadErr } = await supabase.storage.from('class-media').upload(path, file)
      if (!uploadErr && uploadData) {
        const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
        await supabase.from('class_media').insert({ class_id: classData.id, type, url: urlData.publicUrl, order_index: nextIndex + i })
      }
    }

    await notifyEnrolledStudents(data.title, 'class_updated')
    setSubmitting(false)
    router.push(`/class/${classData.id}`)
    router.refresh()
  }

  async function handleDeleteClass() {
    setDeleting(true)
    const { data: enrollments } = await supabase.from('enrollments' as any).select('student_id')
      .eq('class_id', classData.id).in('status', ['confirmed', 'payment_submitted', 'pending_payment'])
    if ((enrollments as any[])?.length > 0) {
      await supabase.from('notifications' as any).insert(
        (enrollments as any[]).map((e: any) => ({
          user_id: e.student_id, type: 'class_cancelled',
          data: { class_id: classData.id, class_title: classData.title },
        })) as any
      )
    }
    await supabase.from('classes' as any).update({ status: 'cancelled' } as any).eq('id', classData.id)
    setDeleting(false)
    router.push('/my-classes')
  }

  return (
    <div className="px-4 py-4">
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Eliminar clase"
          message={`¿Eliminar "${classData.title}"? Todos los inscritos serán notificados.`}
          confirmLabel="Eliminar clase" destructive loading={deleting}
          onConfirm={handleDeleteClass} onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showIndefinitePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 dark:text-dark-text mb-2">Usa el tipo "Entrenamiento"</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text2 mb-4">
              Las clases sin fecha de término deben ser de tipo <strong>Entrenamiento</strong>.
              Las clases periódicas regulares requieren una fecha de cierre.
            </p>
            <button onClick={() => setShowIndefinitePopup(false)} className="w-full btn-primary py-2.5">Entendido</button>
          </div>
        </div>
      )}

      <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-1">Editar clase</h1>
      <p className="text-sm text-gray-500 dark:text-dark-text2 mb-5">Los inscritos serán notificados de los cambios</p>

      {error && <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Type (read-only display for entrenamiento with closed auditions) */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-dark-text2">Tipo de clase</label>
          <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface2 px-3 py-2.5">
            <p className="text-sm font-semibold text-gray-700 dark:text-dark-text capitalize">
              {classData.type === 'suelta' ? 'Clase suelta' : classData.type === 'periodica' ? 'Periódica' : 'Entrenamiento'}
            </p>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Título *</label>
          <input {...register('title')} className="input" />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Descripción</label>
          <textarea {...register('description')} rows={4} className="input resize-none" />
        </div>

        {/* Style + Level */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Estilo</label>
            <select {...register('dance_style')} className="input">
              <option value="">Seleccionar</option>
              {DANCE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Nivel</label>
            <select {...register('level')} className="input">
              {(['todos', 'principiante', 'intermedio', 'avanzado'] as ClassLevel[]).map((l) => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Class type */}
        {!isEntrenamiento && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              Categoría <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
            </label>
            <select {...register('class_type')} className="input">
              <option value="">Sin especificar</option>
              <option value="coreografía">Coreografía</option>
              <option value="freestyle">Freestyle</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        )}

        {/* Schedule - One-time */}
        {classData.type === 'suelta' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Fecha *</label>
              <DateInput
                value={watch('date') ?? ''}
                onChange={(iso) => setValue('date', iso)}
                className="input"
              />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora *</label>
              <input {...register('time')} type="time" className="input" />
              {errors.time && <p className="mt-1 text-xs text-red-600">{errors.time.message}</p>}
            </div>
          </div>
        )}

        {/* Schedule - Periodic/Entrenamiento */}
        {isPeriodic && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Periodicidad *</label>
              <select {...register('recurrence')} className="input">
                <option value="">Seleccionar</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="custom">Personalizado</option>
              </select>
              {errors.recurrence && <p className="mt-1 text-xs text-red-600">{errors.recurrence.message}</p>}
            </div>

            {recurrence && recurrence !== 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Día *</label>
                  <select {...register('day_of_week')} className="input">
                    <option value="">Seleccionar</option>
                    {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                </div>
              </div>
            )}

            {recurrence === 'custom' && (
              <div className="space-y-3">
                <MonthCalendar selected={customDates} onChange={setCustomDates} />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora de inicio *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                </div>
              </div>
            )}

            {/* End date */}
            <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">Fecha de término *</label>
              {!endsIndefinitely && (
                <DateInput
                  value={watch('ends_at') ?? ''}
                  onChange={(iso) => setValue('ends_at', iso || undefined)}
                  className="input"
                />
              )}
              {errors.ends_at && <p className="mt-1 text-xs text-red-600">{errors.ends_at.message}</p>}

              {isEntrenamiento && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={endsIndefinitely ?? false}
                    onChange={(e) => handleIndefiniteChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text2">Indefinido</span>
                  {endsIndefinitely && (
                    <span className="text-xs text-amber-600">— Recuerda avisar a tus alumnos cuándo dejar de pagar</span>
                  )}
                </label>
              )}

              {!isEntrenamiento && (
                <label className="flex items-center gap-2 cursor-pointer text-gray-400" onClick={() => setShowIndefinitePopup(true)}>
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" disabled />
                  <span className="text-sm line-through">Indefinido</span>
                </label>
              )}
            </div>

            {/* Billing day (entrenamiento only) */}
            {isEntrenamiento && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
                  Día de cobro mensual <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(1–27)</span>
                </label>
                <input
                  {...register('billing_day')}
                  type="number"
                  min={1}
                  max={27}
                  placeholder="1"
                  className="input w-24"
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-dark-text2/60">Los alumnos verán en qué día del mes se realiza el cobro.</p>
              </div>
            )}

            {/* Price suelta */}
            {classData.type === 'periodica' && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
                    Precio clase suelta <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
                  </label>
                  <input {...register('price_suelta')} type="number" min={0} placeholder="ej: 5000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
                    Precio 2x clase suelta <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
                  </label>
                  <input {...register('price_suelta_2x')} type="number" min={0} placeholder="ej: 8000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Lugar</label>
            <input {...register('location_name')} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Dirección</label>
            <input {...register('location_address')} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Ciudad</label>
            <CityCombobox value={cityValue} onChange={setCityValue} />
          </div>
        </div>

        {/* Spots + Duration + Price */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Cupos *</label>
            <input {...register('max_spots')} type="number" min={1} className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Duración (min)</label>
            <input {...register('duration_minutes')} type="number" min={30} className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              {isPeriodic ? 'Precio mensual ($) *' : 'Precio ($) *'}
            </label>
            <input {...register('price')} type="number" min={0} className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
          </div>
        </div>

        {/* Price 2x */}
        <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/30 dark:bg-brand-950/20 p-3 space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
            Precio 2x <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
          </label>
          <p className="text-xs text-gray-400 dark:text-dark-text2/60">Precio total para dos alumnos que pagan juntos</p>
          <input {...register('price_2x')} type="number" min={0} placeholder="ej: 18000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
        </div>

        {/* Media */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-dark-text2">
            Fotos/Videos <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(máx. 5)</span>
          </label>
          {existingMedia.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {existingMedia.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
                  {m.type === 'image'
                    ? <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                    : <video src={m.url} className="w-full h-full object-cover" />}
                  <button type="button" onClick={() => removeExistingMedia(m)} className="absolute top-1 right-1 rounded-full bg-black/60 p-1">
                    <Trash2 className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {newMediaFiles.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {newMediaFiles.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2 ring-2 ring-brand-400">
                  {m.type === 'image'
                    ? <img src={m.preview} className="w-full h-full object-cover" alt="" />
                    : <video src={m.preview} className="w-full h-full object-cover" />}
                  <button type="button" onClick={() => removeNewMedia(i)} className="absolute top-1 right-1 rounded-full bg-black/60 p-1">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {totalMedia < 5 && (
            <div
              {...getRootProps()}
              className={cn('rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 dark:border-dark-border hover:border-brand-300')}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 dark:text-dark-text2/40 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-dark-text2">Arrastra o selecciona fotos/videos nuevos</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
          {submitting ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Guardando...</span>
          ) : 'Guardar cambios'}
        </button>
      </form>

      <div className="mt-8 border-t border-gray-100 dark:border-dark-border pt-6">
        <p className="text-xs font-semibold text-gray-400 dark:text-dark-text2/60 uppercase tracking-wider mb-3">Zona peligrosa</p>
        <div className="flex flex-col gap-2">
          {isEntrenamiento && !classData.audition_closed && (
            <a
              href={`/class/${classData.id}/auditions`}
              className="flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
            >
              Ver postulaciones
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar esta clase
          </button>
        </div>
      </div>
    </div>
  )
}
