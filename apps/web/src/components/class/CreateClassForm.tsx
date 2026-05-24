'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, Loader2, AlertCircle, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, DAYS_OF_WEEK, canTeachUnlimited, canUploadVideo } from '@danceclass/shared'
import MonthCalendar from '@/components/ui/MonthCalendar'
import CityCombobox from '@/components/ui/CityCombobox'
import DateInput from '@/components/ui/DateInput'
import type { ClassLevel, Recurrence, SubscriptionTier } from '@danceclass/shared'

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
  // One-time
  date: z.string().optional(),
  time: z.string().optional(),
  // Periodic / Entrenamiento
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
  price_2x: z.coerce.number().min(0).optional(),
  price_suelta_2x: z.coerce.number().min(0).optional(),
  // End date
  ends_at: z.string().optional(),
  ends_indefinitely: z.boolean().optional(),
  // Entrenamiento
  requires_audition: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const today = new Date().toISOString().split('T')[0]
  if (data.type === 'suelta') {
    if (!data.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Requerido para clase suelta' })
    else if (data.date < today) ctx.addIssue({ code: 'custom', path: ['date'], message: 'La fecha no puede ser en el pasado' })
    if (!data.time) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Requerido para clase suelta' })
  } else {
    if (!data.recurrence) ctx.addIssue({ code: 'custom', path: ['recurrence'], message: 'Requerido' })
    if (!data.recurring_time) ctx.addIssue({ code: 'custom', path: ['recurring_time'], message: 'Requerido' })
    if (data.recurrence && data.recurrence !== 'custom') {
      if (data.day_of_week === undefined || data.day_of_week === null || isNaN(data.day_of_week as number)) {
        ctx.addIssue({ code: 'custom', path: ['day_of_week'], message: 'Requerido' })
      }
    }
    // ends_at required for periodica (not entrenamiento with indefinitely)
    if (data.type === 'periodica' && !data.ends_at) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Las clases periódicas requieren fecha de término' })
    }
    if (data.type === 'entrenamiento' && !data.ends_at && !data.ends_indefinitely) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Indica fecha de término o marca como Indefinido' })
    }
    if (data.ends_at && data.ends_at < today) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'La fecha de término no puede ser en el pasado' })
    }
  }
})

type FormData = z.infer<typeof schema>

interface CreateClassFormProps {
  teacherId: string
  hasPaymentInfo: boolean
  tier: SubscriptionTier
  sueltas_this_month: number
}

export default function CreateClassForm({ teacherId, hasPaymentInfo, tier, sueltas_this_month }: CreateClassFormProps) {
  const router = useRouter()
  const isBasic = tier === 'basic'
  const unlimited = canTeachUnlimited(tier)
  const mediaLimit = isBasic ? 1 : 5
  const basicBlocked = isBasic && sueltas_this_month >= 1

  const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([])
  const [customDates, setCustomDates] = useState<string[]>([])
  const [cityValue, setCityValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIndefinitePopup, setShowIndefinitePopup] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)

  const nextMonthDate = (() => {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return `01/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  })()

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'suelta',
      level: 'todos',
      duration_minutes: 60,
      ends_indefinitely: false,
      requires_audition: false,
    },
  })

  const classType = watch('type')
  const recurrence = watch('recurrence')
  const endsIndefinitely = watch('ends_indefinitely')
  const requiresAudition = watch('requires_audition')

  const isEntrenamiento = classType === 'entrenamiento'
  const isPeriodic = classType === 'periodica' || isEntrenamiento

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const available = mediaLimit - mediaFiles.length
    if (acceptedFiles.length > available) {
      setError(`Solo puedes subir ${mediaLimit} archivo${mediaLimit !== 1 ? 's' : ''} en total. Ya tienes ${mediaFiles.length}.`)
      return
    }
    const newFiles = acceptedFiles.slice(0, available).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    if (!canUploadVideo(tier) && newFiles.some((f) => f.type === 'video')) {
      setError('Tu plan no permite subir videos. Solo imágenes.')
      return
    }
    setError(null)
    setMediaFiles((prev) => [...prev, ...newFiles])
  }, [mediaFiles.length, mediaLimit, tier])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: canUploadVideo(tier) ? { 'image/*': [], 'video/*': [] } : { 'image/*': [] },
    maxFiles: mediaLimit,
    disabled: mediaFiles.length >= mediaLimit,
  })

  function removeMedia(index: number) {
    URL.revokeObjectURL(mediaFiles[index].preview)
    setMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleIndefiniteChange(checked: boolean) {
    if (checked && classType === 'periodica') {
      setShowIndefinitePopup(true)
      return
    }
    setValue('ends_indefinitely', checked)
    if (checked) setValue('ends_at', undefined)
  }

  async function onSubmit(data: FormData) {
    if (basicBlocked) {
      setShowLimitModal(true)
      return
    }

    if (isPeriodic && data.recurrence === 'custom' && customDates.length === 0) {
      setError('Selecciona al menos una fecha en el calendario')
      return
    }

    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    // Compute start_date = next occurrence of day_of_week from today
    let start_date_value: string | null = null
    if (isPeriodic && data.recurrence !== 'custom' && data.day_of_week != null) {
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

    const { data: classRecord, error: classError } = await supabase
      .from('classes')
      .insert({
        teacher_id: teacherId,
        title: data.title,
        description: data.description || null,
        type: data.type,
        dance_style: data.dance_style || null,
        class_type: data.class_type || null,
        level: data.level,
        date: data.type === 'suelta' ? data.date : null,
        time: data.type === 'suelta' ? data.time : null,
        recurrence: isPeriodic ? data.recurrence : null,
        start_date: start_date_value,
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
        requires_audition: isEntrenamiento ? (data.requires_audition ?? false) : false,
        audition_closed: false,
        status: 'active',
      } as any)
      .select()
      .single()

    if (classError || !classRecord) {
      const code = classError?.code
      const msg = classError?.message ?? ''
      if (code === '42501' || msg.includes('row-level security') || msg.includes('policy')) {
        if (isBasic && sueltas_this_month >= 1) {
          setShowLimitModal(true)
        } else {
          setError('No tienes permisos para crear esta clase. Verifica tu plan de suscripción.')
        }
      } else {
        setError('Error al crear la clase. Intenta de nuevo.')
      }
      setSubmitting(false)
      return
    }

    let mediaError = false
    for (let i = 0; i < mediaFiles.length; i++) {
      const { file, type } = mediaFiles[i]
      const ext = file.name.split('.').pop()
      const path = `${classRecord.id}/${i}.${ext}`
      const { data: uploadData, error: uploadErr } = await supabase.storage.from('class-media').upload(path, file)
      if (uploadErr || !uploadData) { mediaError = true; continue }
      const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
      const { error: mediaInsertErr } = await supabase.from('class_media').insert({
        class_id: classRecord.id, type, url: urlData.publicUrl, order_index: i,
      })
      if (mediaInsertErr) mediaError = true
    }

    if (mediaError) setError('La clase se creó, pero hubo un error al subir algunos archivos.')

    const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', teacherId)
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
      <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text mb-1">Publicar clase</h1>
      <p className="text-sm text-gray-500 dark:text-dark-text2 mb-5">Comparte los detalles de tu clase</p>

      {/* Monthly limit modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 dark:text-dark-text mb-2">Límite mensual alcanzado</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text2 mb-4">
              Ya publicaste tu clase de este mes. Podrás publicar la siguiente desde el{' '}
              <strong>{nextMonthDate}</strong>.
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text2 mb-4">
              Actualiza al plan <strong>Pro</strong> para publicar clases sin límite.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowLimitModal(false)} className="flex-1 rounded-xl border border-gray-200 dark:border-dark-border py-2.5 text-sm font-medium text-gray-700 dark:text-dark-text2 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2">
                Cerrar
              </button>
              <a href="/plans" className="flex-1 btn-primary py-2.5 text-sm text-center">
                Ver planes
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Indefinite popup for periodica */}
      {showIndefinitePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 dark:text-dark-text mb-2">Usa el tipo "Entrenamiento"</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text2 mb-4">
              Las clases sin fecha de término deben ser de tipo <strong>Entrenamiento</strong>.
              Las clases periódicas regulares requieren una fecha de cierre.
            </p>
            <button
              onClick={() => setShowIndefinitePopup(false)}
              className="w-full btn-primary py-2.5"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {!hasPaymentInfo && (
        <div className="mb-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Configura tus datos bancarios</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">Los estudiantes necesitarán tus datos para pagarte.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {basicBlocked && (
        <div className="mb-4 rounded-xl bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-900/50 p-4 flex gap-3">
          <Info className="h-5 w-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-brand-800 dark:text-brand-200">Límite mensual alcanzado</p>
            <p className="text-xs text-brand-700 dark:text-brand-300 mt-0.5">
              El plan Básico permite 1 clase suelta por mes. Ya publicaste tu clase de este mes.
              Actualiza a Pro para publicar sin límites.
            </p>
          </div>
        </div>
      )}

      {isBasic && !basicBlocked && (
        <div className="mb-4 rounded-xl bg-gray-50 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border p-4 flex gap-3">
          <Info className="h-5 w-5 text-gray-400 dark:text-dark-text2 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 dark:text-dark-text2">
            Plan Básico: puedes publicar <strong>1 clase suelta por mes</strong> con hasta <strong>1 foto o video</strong>.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Type selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-dark-text2">Tipo de clase</label>
          <div className="space-y-2">
            {[
              { value: 'suelta', label: 'Clase suelta', desc: 'Una fecha específica', locked: false },
              { value: 'periodica', label: 'Periódica', desc: unlimited ? 'Recurrente con fechas de cierre' : 'Solo plan Pro', locked: isBasic },
              { value: 'entrenamiento', label: 'Entrenamiento', desc: unlimited ? 'Proceso largo, con postulaciones opcionales' : 'Solo plan Pro', locked: isBasic },
            ].map(({ value, label, desc, locked }) => (
              <label key={value} className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-3 transition-colors',
                locked ? 'opacity-40 cursor-not-allowed border-gray-200' : 'cursor-pointer',
                !locked && classType === value ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-950/30' : 'border-gray-200 dark:border-dark-border'
              )}>
                <input type="radio" value={value} {...register('type')} className="sr-only" disabled={locked} />
                <div>
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Título *</label>
          <input {...register('title')} placeholder="ej: Clases de Salsa — Nivel básico" className="input" />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Descripción</label>
          <textarea {...register('description')} rows={4} placeholder="Describe la clase, qué aprenderán, requisitos previos..." className="input resize-none" />
        </div>

        {/* Dance style + Level */}
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

        {/* Class type (category) */}
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
        {classType === 'suelta' && (
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

        {/* Schedule - Periodic / Entrenamiento */}
        {isPeriodic && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Periodicidad *</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Día *</label>
                  <select {...register('day_of_week')} className="input">
                    <option value="">Seleccionar</option>
                    {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  {errors.day_of_week && <p className="mt-1 text-xs text-red-600">{errors.day_of_week.message}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                  {errors.recurring_time && <p className="mt-1 text-xs text-red-600">{errors.recurring_time.message}</p>}
                </div>
              </div>
            )}

            {recurrence === 'custom' && (
              <div className="space-y-3">
                <MonthCalendar selected={customDates} onChange={setCustomDates} disablePast />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora de inicio *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                  {errors.recurring_time && <p className="mt-1 text-xs text-red-600">{errors.recurring_time.message}</p>}
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
                <label
                  className="flex items-center gap-2 cursor-pointer text-gray-400"
                  onClick={() => setShowIndefinitePopup(true)}
                >
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" disabled />
                  <span className="text-sm line-through">Indefinido</span>
                </label>
              )}
            </div>

            {/* Price suelta (only for periodica, not entrenamiento) */}
            {classType === 'periodica' && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
                  Precio clase suelta <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
                </label>
                <p className="text-xs text-gray-400 dark:text-dark-text2/60">Si los alumnos también pueden pagar solo una clase</p>
                <input {...register('price_suelta')} type="number" min={0} placeholder="ej: 5000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
                {errors.price_suelta && <p className="mt-1 text-xs text-red-600">{errors.price_suelta.message}</p>}

                {/* 2x for suelta within monthly */}
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2 mt-3">
                  Precio 2x clase suelta <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
                </label>
                <p className="text-xs text-gray-400 dark:text-dark-text2/60">Precio total para dos personas en una clase suelta</p>
                <input {...register('price_suelta_2x')} type="number" min={0} placeholder="ej: 8000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
              </div>
            )}

            {/* Audition toggle for entrenamiento */}
            {isEntrenamiento && (
              <div className="rounded-xl border border-brand-200 dark:border-brand-900/40 bg-brand-50/40 dark:bg-brand-950/20 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('requires_audition')}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  <span className="text-sm font-medium text-gray-800 dark:text-dark-text">Requiere postulación</span>
                </label>
                {requiresAudition && (
                  <p className="text-xs text-brand-700 dark:text-brand-300">
                    Los interesados deberán completar un formulario con su nombre, edad, teléfono y video opcional.
                    Podrás aceptar o rechazar cada postulación desde el panel de postulaciones.
                    Al cerrar la etapa, la clase se puede editar normalmente.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Location */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Lugar</label>
            <input {...register('location_name')} placeholder="ej: Estudio Dance House" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Dirección</label>
            <input {...register('location_address')} placeholder="ej: Av. Providencia 1234, Santiago" className="input" />
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
            <input {...register('max_spots')} type="number" min={1} placeholder="15" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
            {errors.max_spots && <p className="mt-1 text-xs text-red-600">{errors.max_spots.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Duración (min)</label>
            <input {...register('duration_minutes')} type="number" min={30} placeholder="60" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              {isPeriodic ? 'Precio mensual ($) *' : 'Precio ($) *'}
            </label>
            <input {...register('price')} type="number" min={0} placeholder="15000" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
          </div>
        </div>

        {/* Price 2x (for suelta or entrenamiento monthly) */}
        <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/30 dark:bg-brand-950/20 p-3 space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
            Precio 2x <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
          </label>
          <p className="text-xs text-gray-400 dark:text-dark-text2/60">
            {classType === 'suelta'
              ? 'Precio total cuando dos alumnos pagan juntos en un mismo comprobante'
              : 'Precio mensual total para dos alumnos que pagan juntos'}
          </p>
          <input {...register('price_2x')} type="number" min={0} placeholder="ej: 18000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
        </div>

        {/* Media upload */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-dark-text2">
            {isBasic ? 'Foto o Video' : 'Fotos/Videos'}{' '}
            <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(máx. {mediaLimit})</span>
          </label>

          {mediaFiles.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {mediaFiles.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {m.type === 'image'
                    ? <img src={m.preview} className="w-full h-full object-cover" alt="" />
                    : <video src={m.preview} className="w-full h-full object-cover" />
                  }
                  <button type="button" onClick={() => removeMedia(i)} className="absolute top-1 right-1 rounded-full bg-black/60 p-1">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mediaFiles.length < mediaLimit && (
            <div
              {...getRootProps()}
              className={cn(
                'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 dark:border-dark-border hover:border-brand-300'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 text-gray-300 dark:text-dark-text2/40 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-dark-text2">Arrastra o selecciona fotos/videos</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Publicando...
            </span>
          ) : basicBlocked ? 'Límite mensual alcanzado' : 'Publicar clase'}
        </button>
      </form>
    </div>
  )
}
