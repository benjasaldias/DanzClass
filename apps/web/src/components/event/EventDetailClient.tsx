'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Calendar, Users, Ticket, Edit2, Share2, Trophy, BookOpen, Star, CheckCircle, Clock, Upload, X } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@danceclass/shared'
import type { EventType } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import InviteTeachersModal from './InviteTeachersModal'

const EVENT_TYPE_ICONS = {
  batalla: Trophy,
  masterclass: BookOpen,
  otro: Star,
}

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

interface Props {
  event: any
  currentUser: any
  creatorPaymentInfo: any
  myEnrollment: any
  myPayment: any
}

export default function EventDetailClient({ event, currentUser, creatorPaymentInfo, myEnrollment, myPayment }: Props) {
  const supabase = createClient()
  const [enrollment, setEnrollment] = useState(myEnrollment)
  const [payment, setPayment] = useState(myPayment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCreator = currentUser?.id === event.creator_id
  const eventType = event.event_type as EventType
  const TypeIcon = EVENT_TYPE_ICONS[eventType] ?? Star
  const acceptedInvites = (event.event_invites ?? []).filter((i: any) => i.status === 'accepted')
  const pendingInvites = (event.event_invites ?? []).filter((i: any) => i.status === 'pending')
  const enrolledCount = (event.event_enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
  const isFull = event.has_spots && event.max_spots != null && enrolledCount >= event.max_spots
  const isPast = new Date(event.event_date) < new Date(new Date().toDateString())

  async function handleShare() {
    await navigator.clipboard.writeText(`${window.location.origin}/event/${event.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleEnroll() {
    if (!currentUser) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await (supabase as any)
        .from('event_enrollments')
        .insert({ event_id: event.id, user_id: currentUser.id })
        .select('id, status')
        .single()
      if (err) throw err
      setEnrollment(data)
    } catch (e: any) {
      setError(e.message ?? 'Error al inscribirse')
    } finally {
      setLoading(false)
    }
  }

  async function handleUploadReceipt(file: File) {
    if (!currentUser || !enrollment) return
    setLoading(true)
    setError(null)
    try {
      // Validate magic bytes
      const header = await file.slice(0, 4).arrayBuffer()
      const hex = Array.from(new Uint8Array(header)).map(b => b.toString(16).padStart(2, '0')).join('')
      const allowed = ['ffd8ff', '89504e47', '25504446', '52494646']
      if (!allowed.some(m => hex.startsWith(m))) {
        throw new Error('Formato de archivo no válido. Usa JPG, PNG, PDF o WEBP.')
      }

      const ext = file.name.split('.').pop()
      const path = `${currentUser.id}/${event.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('event-media')
        .upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr

      // Upsert payment record
      const { data: payData, error: payErr } = await (supabase as any)
        .from('event_payments')
        .insert({
          enrollment_id: enrollment.id,
          event_id: event.id,
          user_id: currentUser.id,
          amount: event.entry_price ?? 0,
          receipt_url: path,
          status: 'submitted',
        })
        .select('id, status, receipt_url, amount')
        .single()
      if (payErr) throw payErr

      // Update enrollment status
      await (supabase as any)
        .from('event_enrollments')
        .update({ status: 'payment_submitted' })
        .eq('id', enrollment.id)

      setPayment(payData)
      setEnrollment((prev: any) => ({ ...prev, status: 'payment_submitted' }))
    } catch (e: any) {
      setError(e.message ?? 'Error al subir comprobante')
    } finally {
      setLoading(false)
    }
  }

  const canEnroll = currentUser && !isCreator && !enrollment && !isFull && !isPast && event.status === 'active'
  const showPaymentSection = enrollment && event.has_entry && enrollment.status !== 'cancelled'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700">
          ← Volver al feed
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-dark-text2 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            {copied ? 'Copiado!' : 'Compartir'}
          </button>
          {isCreator && (
            <Link
              href={`/event/${event.id}/edit`}
              className="flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-dark-surface2 transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              Editar
            </Link>
          )}
        </div>
      </div>

      {/* Cover */}
      {event.cover_url ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
          <Image src={event.cover_url} alt={event.title} fill className="object-cover" />
          {isFull && (
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-red-500/90 text-white text-sm font-semibold">
              Lleno
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-video rounded-2xl bg-gradient-to-br from-violet-100 to-brand-50 dark:from-dark-surface2 dark:to-dark-surface flex flex-col items-center justify-center gap-3">
          <TypeIcon className="h-16 w-16 text-brand-400" />
          <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-widest">
            {EVENT_TYPE_LABELS[eventType]}
          </span>
        </div>
      )}

      {/* Title + type */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
            <TypeIcon className="h-3 w-3" />
            {EVENT_TYPE_LABELS[eventType]}
          </span>
          {event.status === 'cancelled' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400">
              Cancelado
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text">{event.title}</h1>
        {event.description && (
          <p className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="rounded-xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text">
          <Calendar className="h-4 w-4 text-brand-500 shrink-0" />
          <span className="font-medium">{formatEventDate(event.event_date)}</span>
          {event.event_time && <span className="text-gray-500 dark:text-dark-text2">· {event.event_time}</span>}
        </div>
        {event.city && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text">
            <MapPin className="h-4 w-4 text-brand-500 shrink-0" />
            {event.city}
          </div>
        )}
        {event.has_spots && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-text">
            <Users className="h-4 w-4 text-brand-500 shrink-0" />
            {enrolledCount}/{event.max_spots} inscritos
            {isFull && <span className="text-red-500 font-medium">· Lleno</span>}
          </div>
        )}
        {event.has_entry && (
          <div className="flex items-center gap-2 text-sm">
            <Ticket className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Entrada: {formatCLP(event.entry_price ?? 0)}
            </span>
          </div>
        )}
        {!event.has_entry && (
          <div className="text-sm text-gray-500 dark:text-dark-text2">Entrada libre</div>
        )}
      </div>

      {/* Organizer */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-dark-surface border border-gray-100 dark:border-dark-border">
        <Avatar src={event.creator?.avatar_url} name={event.creator?.full_name} size="md" />
        <div>
          <p className="text-xs text-gray-500 dark:text-dark-text2">Organizador</p>
          <Link href={`/teacher/${event.creator?.username}`} className="font-semibold text-gray-900 dark:text-dark-text hover:text-brand-600">
            {event.creator?.full_name ?? `@${event.creator?.username}`}
          </Link>
          <p className="text-xs text-gray-500 dark:text-dark-text2">@{event.creator?.username}</p>
        </div>
      </div>

      {/* Invited teachers */}
      {(acceptedInvites.length > 0 || (isCreator && pendingInvites.length > 0)) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-dark-text">Profesores invitados</h2>
          <div className="space-y-2">
            {acceptedInvites.map((invite: any) => (
              <Link
                key={invite.id}
                href={`/teacher/${invite.teacher?.username}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border hover:border-violet-200 transition-colors"
              >
                <Avatar src={invite.teacher?.avatar_url} name={invite.teacher?.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-dark-text">{invite.teacher?.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2">@{invite.teacher?.username}</p>
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> Confirmado
                </span>
              </Link>
            ))}
            {isCreator && pendingInvites.map((invite: any) => (
              <div key={invite.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border opacity-60">
                <Avatar src={invite.teacher?.avatar_url} name={invite.teacher?.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-dark-text">{invite.teacher?.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2">@{invite.teacher?.username}</p>
                </div>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Pendiente
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creator actions: invite teachers */}
      {isCreator && event.status === 'active' && (
        <button
          onClick={() => setShowInvite(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
        >
          + Invitar profesor
        </button>
      )}

      {/* Enrollment section */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!currentUser && (
        <div className="rounded-xl bg-brand-50 dark:bg-dark-surface2 border border-brand-100 dark:border-dark-border p-4 text-center">
          <p className="text-sm text-gray-700 dark:text-dark-text mb-3">Inicia sesión para inscribirte al evento</p>
          <Link href="/auth/login" className="btn-primary px-6 py-2 text-sm">
            Iniciar sesión
          </Link>
        </div>
      )}

      {canEnroll && (
        <button
          onClick={handleEnroll}
          disabled={loading}
          className="w-full btn-primary py-3 disabled:opacity-50"
        >
          {loading ? 'Inscribiéndote...' : event.has_entry ? `Inscribirse · ${formatCLP(event.entry_price ?? 0)}` : 'Inscribirse (entrada libre)'}
        </button>
      )}

      {showPaymentSection && (
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-dark-text">
            {enrollment.status === 'confirmed' ? '✅ Inscripción confirmada' : 'Comprobante de pago'}
          </h2>

          {enrollment.status === 'pending_payment' && !payment && creatorPaymentInfo && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-dark-text2">
                Transfiere <strong>{formatCLP(event.entry_price ?? 0)}</strong> al organizador y sube tu comprobante:
              </p>
              <div className="bg-gray-50 dark:bg-dark-surface2 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-gray-500">Banco:</span> {creatorPaymentInfo.bank}</p>
                <p><span className="text-gray-500">Tipo:</span> {creatorPaymentInfo.account_type}</p>
                <p><span className="text-gray-500">N° cuenta:</span> {creatorPaymentInfo.account_number}</p>
                <p><span className="text-gray-500">RUT:</span> {creatorPaymentInfo.rut}</p>
                <p><span className="text-gray-500">Titular:</span> {creatorPaymentInfo.account_holder}</p>
              </div>
            </div>
          )}

          {enrollment.status === 'pending_payment' && !payment && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadReceipt(f) }} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-dark-border text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {loading ? 'Subiendo...' : 'Subir comprobante'}
              </button>
            </div>
          )}

          {(enrollment.status === 'payment_submitted' || payment?.status === 'submitted') && (
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <Clock className="h-4 w-4 shrink-0" />
              Comprobante enviado. El organizador confirmará tu inscripción.
            </div>
          )}

          {enrollment.status === 'confirmed' && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Tu inscripción está confirmada. ¡Nos vemos en el evento!
            </div>
          )}
        </div>
      )}

      {enrollment && !event.has_entry && enrollment.status !== 'cancelled' && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
          <CheckCircle className="h-4 w-4 shrink-0" />
          ¡Estás inscrito! Te esperamos en el evento.
        </div>
      )}

      {/* Creator: list of enrollments to confirm */}
      {isCreator && event.has_entry && (event.event_enrollments ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-dark-text">
            Pagos por verificar
          </h2>
          <EnrollmentConfirmList eventId={event.id} />
        </div>
      )}

      {showInvite && (
        <InviteTeachersModal
          eventId={event.id}
          existingInvites={event.event_invites ?? []}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  )
}

// Sub-component: creator confirms payments
function EnrollmentConfirmList({ eventId }: { eventId: string }) {
  const supabase = createClient()
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  async function load() {
    const { data } = await (supabase as any)
      .from('event_enrollments')
      .select(`
        id, status, user_id,
        user:profiles!user_id(username, full_name, avatar_url),
        event_payments(id, status, receipt_url, amount)
      `)
      .eq('event_id', eventId)
      .neq('status', 'cancelled')
      setEnrollments(data ?? [])
    setLoaded(true)
  }

  if (!loaded) {
    return (
      <button onClick={load} className="text-sm text-brand-600 dark:text-brand-400 underline">
        Cargar inscripciones
      </button>
    )
  }

  async function confirm(enrollmentId: string) {
    setLoading(enrollmentId)
    await (supabase as any).from('event_enrollments').update({ status: 'confirmed' }).eq('id', enrollmentId)
    await (supabase as any).from('event_payments').update({ status: 'verified' }).eq('enrollment_id', enrollmentId)
    setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status: 'confirmed' } : e))
    setLoading(null)
  }

  if (enrollments.length === 0) return <p className="text-sm text-gray-500 dark:text-dark-text2">Sin inscripciones aún.</p>

  return (
    <div className="space-y-2">
      {enrollments.map((enroll: any) => {
        const pay = enroll.event_payments?.[0]
        return (
          <div key={enroll.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border">
            <Avatar src={enroll.user?.avatar_url} name={enroll.user?.full_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{enroll.user?.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-dark-text2">
                {enroll.status === 'confirmed' ? '✅ Confirmado' :
                 enroll.status === 'payment_submitted' ? '⏳ Comprobante enviado' :
                 '💸 Sin comprobante'}
              </p>
            </div>
            {enroll.status === 'payment_submitted' && (
              <button
                onClick={() => confirm(enroll.id)}
                disabled={loading === enroll.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading === enroll.id ? '...' : 'Confirmar'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
