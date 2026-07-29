'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Upload, X, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendNotifications } from '@/lib/notifications'
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary'
import { cn } from '@/lib/utils'
import { DANCE_STYLES, DAYS_OF_WEEK, LEVEL_LABELS, resolveClassStartDate, validatePeriodicaDates, lastCustomDate } from '@danceclass/shared'
import MonthCalendar from '@/components/ui/MonthCalendar'
import CityCombobox from '@/components/ui/CityCombobox'
import AddressAutocomplete from '@/components/ui/AddressAutocomplete'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import DateInput from '@/components/ui/DateInput'
import PaymentMethodsField from '@/components/class/PaymentMethodsField'
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
  start_date: z.string().optional(),
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
  allow_late_payment: z.boolean().optional(),
  // Vías de pago que acepta la clase (marketplace v2)
  accepts_mp: z.boolean(),
  accepts_transfer: z.boolean(),
}).superRefine((data, ctx) => {
  // Espeja el CHECK `classes_payment_method_check` de la migración 061.
  if (!data.accepts_mp && !data.accepts_transfer) {
    ctx.addIssue({ code: 'custom', path: ['accepts_transfer'], message: 'Elige al menos una forma de pago' })
  }
  if (data.type === 'suelta') {
    if (!data.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Requerido' })
    if (!data.time) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Requerido' })
  } else {
    // La periódica ya no elige recurrencia: es siempre calendario (migración 067).
    if (data.type !== 'periodica' && !data.recurrence) {
      ctx.addIssue({ code: 'custom', path: ['recurrence'], message: 'Requerido' })
    }
    if (!data.recurring_time) ctx.addIssue({ code: 'custom', path: ['recurring_time'], message: 'Requerido' })
    if (data.recurrence && data.recurrence !== 'custom') {
      if (data.day_of_week === undefined || isNaN(data.day_of_week as number)) {
        ctx.addIssue({ code: 'custom', path: ['day_of_week'], message: 'Requerido' })
      }
    }
    if (data.type === 'entrenamiento' && !data.ends_at && !data.ends_indefinitely) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Indica fecha de término o marca como Indefinido' })
    }
    // Un entrenamiento debe declarar desde cuándo corre (con 'custom' lo definen
    // las fechas del calendario). A diferencia de crear, acá SÍ se permite una
    // fecha pasada: un entrenamiento en curso empezó antes de hoy.
    if (data.type === 'entrenamiento' && data.recurrence !== 'custom' && !data.start_date) {
      ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'Indica desde cuándo parte el entrenamiento' })
    }
    if (data.date && data.ends_at && data.ends_at <= data.date) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'La fecha de término debe ser posterior a la fecha de inicio' })
    }
    if (data.start_date && data.ends_at && data.ends_at < data.start_date) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'La fecha de término debe ser posterior a la de inicio' })
    }
  }
})

type FormData = z.infer<typeof schema>

function noExp(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
}

interface ExistingMedia {
  id: string; url: string; type: 'image' | 'video'; order_index: number
}

interface EditClassFormProps {
  classData: any
  hasPaymentInfo: boolean
  mpConnected: boolean
}

export default function EditClassForm({ classData, hasPaymentInfo, mpConnected }: EditClassFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const isEntrenamiento = classData.type === 'entrenamiento'
  const isPeriodic = classData.type === 'periodica' || isEntrenamiento

  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(
    [...(classData.media ?? [])].sort((a: any, b: any) => a.order_index - b.order_index)
  )
  const [newMediaFiles, setNewMediaFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([])
  const [customDates, setCustomDates] = useState<string[]>(classData.custom_dates ?? [])
  // Calendario tal como venía de la base. La migración 067 convirtió las
  // periódicas weekly/biweekly ya publicadas expandiendo TODAS sus ocurrencias,
  // así que muchas heredadas abarcan varios meses. La regla de "un solo mes"
  // se aplica solo si el profesor TOCA el calendario: si no, no podría editar
  // ni el precio de una clase que ya tiene alumnos pagando.
  const [initialCustomDates] = useState<string[]>(() => [...(classData.custom_dates ?? [])].sort())
  const [cityValue, setCityValue] = useState<string>(classData.city ?? '')
  const [addressValue, setAddressValue] = useState<string>(classData.location_address ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    classData.latitude != null && classData.longitude != null
      ? { lat: classData.latitude, lng: classData.longitude }
      : null
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
      start_date: classData.start_date ?? undefined,
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
      allow_late_payment: (classData as any).allow_late_payment ?? true,
      // `!== false` para clases anteriores a la migración 061 (ambas por defecto).
      accepts_mp: mpConnected && (classData as any).accepts_mp !== false,
      accepts_transfer: (classData as any).accepts_transfer !== false,
    },
  })

  const classType = watch('type')
  const recurrence = watch('recurrence')
  const endsIndefinitely = watch('ends_indefinitely')
  const allowLatePayment = watch('allow_late_payment')
  const acceptsMp = watch('accepts_mp')
  const acceptsTransfer = watch('accepts_transfer')
  const priceValue = watch('price')
  const price2xValue = watch('price_2x')
  const priceSueltaValue = watch('price_suelta')
  const priceSuelta2xValue = watch('price_suelta_2x')

  // Una periódica creada antes de la migración 067 llega con recurrence
  // 'weekly'/'biweekly'/'monthly'. Como el selector ya no se renderiza para
  // ella, hay que forzarla a calendario al montar o el formulario no mostraría
  // ningún modo de definir fechas.
  useEffect(() => {
    if (classData.type === 'periodica' && recurrence !== 'custom') {
      setValue('recurrence', 'custom')
    }
  }, [classData.type, recurrence, setValue])

  const datesUnchanged = customDates.length === initialCustomDates.length
    && [...customDates].sort().every((d, i) => d === initialCustomDates[i])
  const datesError = (isPeriodic && recurrence === 'custom' && customDates.length > 0)
    ? validatePeriodicaDates(customDates, { allowMultiMonth: isEntrenamiento || datesUnchanged })
    : null

  const MAX_VIDEO_BYTES = 200 * 1024 * 1024
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const slots = 5 - totalMedia
    const newFiles = acceptedFiles.slice(0, slots).map((file) => ({
      file, preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    const oversized = newFiles.find((f) =>
      f.type === 'video' ? f.file.size > MAX_VIDEO_BYTES : f.file.size > MAX_IMAGE_BYTES
    )
    if (oversized) {
      setError(oversized.type === 'video'
        ? 'El video supera los 200 MB. Comprímelo antes de subir.'
        : 'La imagen supera los 10 MB.')
      return
    }
    setError(null)
    setNewMediaFiles((prev) => [...prev, ...newFiles])
  }, [totalMedia])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'video/*': [] }, maxFiles: 5, disabled: totalMedia >= 5,
  })

  async function removeExistingMedia(media: ExistingMedia) {
    // Vía API para borrar también el asset físico (video en Cloudinary / imagen
    // en el bucket), no solo la fila (item 10).
    await fetch('/api/class/media-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: media.id }),
    }).catch(() => {})
    setExistingMedia((prev) => prev.filter((m) => m.id !== media.id))
  }

  function removeNewMedia(index: number) {
    URL.revokeObjectURL(newMediaFiles[index].preview)
    setNewMediaFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleIndefiniteChange(checked: boolean) {
    setValue('ends_indefinitely', checked)
    if (checked) setValue('ends_at', undefined)
  }

  async function notifyEnrolledStudents(classTitle: string, type: 'class_updated' | 'class_cancelled') {
    const { data: enrollments } = await supabase
      .from('enrollments').select('student_id').eq('class_id', classData.id)
      .in('status', ['confirmed', 'payment_submitted', 'pending_payment'])
    if (enrollments && enrollments.length > 0) {
      await sendNotifications(
        enrollments.map((e: any) => ({ user_id: e.student_id, type, data: { class_id: classData.id, class_title: classTitle } }))
      )
    }
  }

  async function onSubmit(data: FormData) {
    if (isPeriodic && data.recurrence === 'custom') {
      const dateError = validatePeriodicaDates(customDates, {
        allowMultiMonth: isEntrenamiento || datesUnchanged,
      })
      if (dateError) { setError(dateError); return }
    }
    // Re-geocode if the address changed and has no resolved coordinates.
    let resolvedCoords = coords
    const addr = addressValue.trim()
    if (addr && !coords) {
      setSubmitting(true)
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(addr)}&limit=1`)
        const json = await res.json()
        const best = json.results?.[0]
        if (best) {
          resolvedCoords = { lat: best.lat, lng: best.lng }
        } else {
          setSubmitting(false)
          setError('No pudimos ubicar esa dirección en el mapa. Selecciona una sugerencia o revisa que sea una dirección válida en Chile.')
          return
        }
      } catch {
        setSubmitting(false)
        setError('No se pudo validar la dirección. Revisa tu conexión e intenta de nuevo.')
        return
      }
    }

    setSubmitting(true); setError(null)

    // start_date: ahora es editable (obligatorio en entrenamiento). Se ajusta al
    // día de la semana de la clase porque es el ancla desde la que el motor de
    // sesiones avanza de 7 en 7 / 14 en 14. Si no es periódica, se limpia.
    const start_date_value: string | null = isPeriodic
      ? resolveClassStartDate({
          recurrence: data.recurrence,
          dayOfWeek: data.day_of_week,
          startDate: data.start_date,
          customDates,
        })
      : null

    const { error: updateError } = await supabase.from('classes').update({
      title: data.title,
      description: data.description || null,
      type: data.type,
      dance_style: data.dance_style || null,
      class_type: data.class_type || null,
      level: data.level,
      date: data.type === 'suelta' ? data.date : null,
      time: data.type === 'suelta' ? data.time : null,
      // La periódica es siempre calendario (CHECK classes_periodica_custom_only,
      // migración 067). Explícito acá y no solo vía setValue, para que no
      // dependa de que el efecto haya corrido antes del submit.
      recurrence: isPeriodic ? (data.type === 'periodica' ? 'custom' : data.recurrence) : null,
      start_date: start_date_value,
      day_of_week: isPeriodic && data.recurrence !== 'custom' ? data.day_of_week : null,
      recurring_time: isPeriodic ? data.recurring_time : null,
      custom_dates: isPeriodic && data.recurrence === 'custom' ? customDates : [],
      duration_minutes: data.duration_minutes,
      location_name: data.location_name || null,
      location_address: addressValue.trim() || null,
      latitude: resolvedCoords?.lat ?? null,
      longitude: resolvedCoords?.lng ?? null,
      city: cityValue || null,
      max_spots: data.max_spots,
      price: data.price,
      price_suelta: (classType === 'periodica' && data.price_suelta) ? data.price_suelta : null,
      price_2x: data.price_2x || null,
      price_suelta_2x: (classType === 'periodica' && data.price_suelta_2x) ? data.price_suelta_2x : null,
      // La periódica deriva su término de la última fecha del calendario.
      ends_at: classType === 'periodica'
        ? lastCustomDate(customDates)
        : (isPeriodic && !data.ends_indefinitely ? (data.ends_at || null) : null),
      ends_indefinitely: isEntrenamiento ? (data.ends_indefinitely ?? false) : false,
      billing_day: isEntrenamiento ? (data.billing_day ?? 1) : null,
      allow_late_payment: data.allow_late_payment ?? true,
      // MP solo puede quedar activo con la cuenta del profesor conectada; si al
      // descartarlo no quedara ninguna vía, se cae a transferencia (CHECK 061).
      accepts_mp: mpConnected && data.accepts_mp,
      accepts_transfer: (mpConnected && data.accepts_mp) ? data.accepts_transfer : true,
    } as any).eq('id', classData.id)

    if (updateError) { setError('Error al guardar los cambios.'); setSubmitting(false); return }

    const nextIndex = existingMedia.length
    for (let i = 0; i < newMediaFiles.length; i++) {
      const { file, type } = newMediaFiles[i]
      let mediaUrl: string
      try {
        if (type === 'video' && isCloudinaryConfigured()) {
          const result = await uploadToCloudinary(file, 'video', 'classes')
          mediaUrl = result.secure_url
        } else {
          const ext = file.name.split('.').pop()
          const path = `${classData.id}/${nextIndex + i}.${ext}`
          const { data: uploadData, error: uploadErr } = await supabase.storage.from('class-media').upload(path, file)
          if (uploadErr || !uploadData) continue
          const { data: urlData } = supabase.storage.from('class-media').getPublicUrl(uploadData.path)
          mediaUrl = urlData.publicUrl
        }
      } catch { continue }
      await supabase.from('class_media').insert({ class_id: classData.id, type, url: mediaUrl, order_index: nextIndex + i })
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
      await sendNotifications(
        (enrollments as any[]).map((e: any) => ({
          user_id: e.student_id,
          type: 'class_cancelled',
          data: { class_id: classData.id, class_title: classData.title },
        }))
      )
    }
    // Vía API: soft-delete + limpieza de chats y media (Cloudinary + bucket) server-side (item 10).
    await fetch('/api/class/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classData.id }),
    })
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
                <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
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
            {isEntrenamiento && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Periodicidad *</label>
                <select {...register('recurrence')} className="input">
                  <option value="">Seleccionar</option>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="custom">Personalizado</option>
                </select>
                {recurrence === 'biweekly' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-dark-text2">Quincenal = cada 14 días desde la fecha de inicio.</p>
                )}
                {errors.recurrence && <p className="mt-1 text-xs text-red-600">{errors.recurrence.message}</p>}
              </div>
            )}

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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
                    Fechas de la clase *
                  </label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-dark-text2">
                    {isEntrenamiento
                      ? 'Marca en el calendario los días en que se dicta.'
                      : 'Marca en el calendario los días en que se dicta. Una clase periódica no puede extenderse más de un mes.'}
                  </p>
                </div>
                <MonthCalendar selected={customDates} onChange={setCustomDates} />
                {datesError && <p className="text-xs text-red-600">{datesError}</p>}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Hora de inicio *</label>
                  <input {...register('recurring_time')} type="time" className="input" />
                </div>
              </div>
            )}

            {/* Start date — solo Entrenamiento con recurrencia semanal. */}
            {isEntrenamiento && recurrence !== 'custom' && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
                  Fecha de inicio *
                </label>
                <DateInput
                  value={watch('start_date') ?? ''}
                  onChange={(iso) => setValue('start_date', iso || undefined)}
                  className="input"
                />
                {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>}
                <p className="text-xs text-gray-400 dark:text-dark-text2/60">
                  Cambiarla mueve todas las fechas de la clase. Se ajusta al día de la semana elegido.
                </p>
              </div>
            )}

            {/* End date — solo Entrenamiento: en la periódica lo define la última
                fecha marcada en el calendario. */}
            {isEntrenamiento && (
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

            </div>
            )}

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
                  step="1"
                  placeholder="1"
                  className="input w-24"
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  onKeyDown={noExp}
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
                  <input {...register('price_suelta')} type="number" min={0} max={10000000} step="1" placeholder="ej: 5000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
                    Precio 2x clase suelta <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
                  </label>
                  <input {...register('price_suelta_2x')} type="number" min={0} max={10000000} step="1" placeholder="ej: 8000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Política de pago (item 3) */}
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/60 dark:bg-dark-surface2/40 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('allow_late_payment')}
              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-600"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-dark-text">Permitir pagos atrasados</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-dark-text2">
            {allowLatePayment
              ? 'El alumno reserva el cupo y puede pagar después (queda como deudor hasta que confirmes el pago o pague por Mercado Pago).'
              : 'El cupo se reserva solo por 10 minutos mientras el alumno paga. Si no concreta el pago (comprobante o Mercado Pago) a tiempo, el cupo se libera.'}
          </p>
        </div>

        {/* Location */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Lugar</label>
            <input {...register('location_name')} className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Dirección</label>
            <AddressAutocomplete
              value={addressValue}
              hasCoords={!!coords}
              onChange={(addr, c) => { setAddressValue(addr); setCoords(c) }}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-dark-text2">Elige una sugerencia para fijar la ubicación en el mapa y aparecer en "Cerca".</p>
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
            <input {...register('max_spots')} type="number" min={1} max={100} step="1" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">Duración (min)</label>
            <input {...register('duration_minutes')} type="number" min={30} max={240} step="1" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-dark-text2">
              {isPeriodic ? 'Precio mensual ($) *' : 'Precio ($) *'}
            </label>
            <input {...register('price')} type="number" min={0} max={10000000} step="1" className="input" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
          </div>
        </div>

        {/* Price 2x */}
        <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50/30 dark:bg-brand-950/20 p-3 space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text2">
            Precio 2x <span className="text-gray-400 dark:text-dark-text2/50 font-normal">(opcional)</span>
          </label>
          <p className="text-xs text-gray-400 dark:text-dark-text2/60">Precio total para dos alumnos que pagan juntos</p>
          <input {...register('price_2x')} type="number" min={0} max={10000000} step="1" placeholder="ej: 18000" className="input mt-1" onWheel={(e) => (e.target as HTMLInputElement).blur()} onKeyDown={noExp} />
        </div>

        {/* Formas de pago aceptadas + preview del precio que verá el alumno */}
        <PaymentMethodsField
          acceptsMp={!!acceptsMp}
          acceptsTransfer={!!acceptsTransfer}
          onChange={(patch) => {
            if (patch.accepts_mp !== undefined) setValue('accepts_mp', patch.accepts_mp, { shouldValidate: true })
            if (patch.accepts_transfer !== undefined) setValue('accepts_transfer', patch.accepts_transfer, { shouldValidate: true })
          }}
          mpConnected={mpConnected}
          hasPaymentInfo={hasPaymentInfo}
          price={Number(priceValue)}
          priceLabel={isPeriodic ? 'Precio mensual' : 'Precio de la clase'}
          price2x={Number(price2xValue)}
          priceSuelta={classType === 'periodica' ? Number(priceSueltaValue) : undefined}
          priceSuelta2x={classType === 'periodica' ? Number(priceSuelta2xValue) : undefined}
          error={errors.accepts_transfer?.message as string | undefined}
        />

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
