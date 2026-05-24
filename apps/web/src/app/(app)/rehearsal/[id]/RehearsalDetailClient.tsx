'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, MapPin, Clock, Users, Check, X, Pencil, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'
import dynamic from 'next/dynamic'

const RehearsalCoordinationCalendar = dynamic(
  () => import('@/components/rehearsal/RehearsalCoordinationCalendar'),
  { ssr: false }
)

const EditRehearsalModal = dynamic(
  () => import('@/components/rehearsal/EditRehearsalModal'),
  { ssr: false }
)

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatRehearsalDate(rehearsal: any): string {
  if (rehearsal.date_mode === 'single' && rehearsal.rehearsal_date) {
    const [y, m, d] = rehearsal.rehearsal_date.split('-').map(Number)
    return `${d} de ${MONTHS_ES[m - 1]} ${y}`
  }
  if (rehearsal.date_mode === 'custom' && rehearsal.custom_dates?.length) {
    const sorted = [...rehearsal.custom_dates].sort()
    if (sorted.length === 1) {
      const [y, m, d] = sorted[0].split('-').map(Number)
      return `${d} de ${MONTHS_ES[m - 1]} ${y}`
    }
    return `${sorted.length} fechas seleccionadas`
  }
  if (rehearsal.date_mode === 'coordinate' && rehearsal.coordinate_month) {
    const [y, m] = rehearsal.coordinate_month.split('-').map(Number)
    return `Coordinando para ${MONTHS_ES[m - 1]} ${y}`
  }
  return 'Fecha por coordinar'
}

interface Props {
  rehearsal: any
  currentUserId: string
}

export default function RehearsalDetailClient({ rehearsal: initialRehearsal, currentUserId }: Props) {
  const router = useRouter()
  const [rehearsal, setRehearsal] = useState(initialRehearsal)
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState<string | null>(rehearsal.my_invite?.status ?? null)
  const [showCustomDates, setShowCustomDates] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const isCreator = rehearsal.creator_id === currentUserId
  const myInvite = rehearsal.my_invite
  const invites: any[] = rehearsal.invites ?? []
  const acceptedCount = invites.filter((i: any) => i.status === 'accepted').length
  const pendingCount = invites.filter((i: any) => i.status === 'pending').length

  async function handleRespond(status: 'accepted' | 'rejected') {
    if (!myInvite) return
    setResponding(true)
    try {
      const res = await fetch('/api/rehearsal/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: myInvite.id, status }),
      })
      if (res.ok) setLocalStatus(status)
    } finally {
      setResponding(false)
    }
  }

  async function reloadRehearsal() {
    const res = await fetch(`/api/rehearsal/${rehearsal.id}`)
    if (res.ok) {
      const data = await res.json()
      setRehearsal({ ...data, my_invite: (data.invites ?? []).find((i: any) => i.user_id === currentUserId) ?? null })
    }
  }

  const dateLabel = formatRehearsalDate(rehearsal)
  const customDatesSorted = rehearsal.date_mode === 'custom' ? [...(rehearsal.custom_dates ?? [])].sort() : []

  return (
    <div className="min-h-screen bg-blanco-violeta dark:bg-dark-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md border-b border-gray-100 dark:border-dark-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-dark-text" />
        </button>
        <h1 className="flex-1 font-semibold text-gray-900 dark:text-dark-text text-base truncate">
          {rehearsal.title}
        </h1>
        {isCreator && (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 text-sm text-[#7F77DD] hover:text-[#6B64C8] font-medium px-3 py-1.5 rounded-xl hover:bg-[#EEEDFE] dark:hover:bg-dark-surface2 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Header card */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden">
          <div className="h-1 bg-[#7F77DD]" />
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 text-[#534AB7] dark:text-violet-300">
                Ensayo
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">{rehearsal.title}</h2>
            {rehearsal.description && (
              <p className="mt-2 text-sm text-gray-600 dark:text-dark-text2 leading-relaxed">
                {rehearsal.description}
              </p>
            )}

            {/* Creator */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
              <Avatar src={rehearsal.creator?.avatar_url ?? null} name={rehearsal.creator?.full_name ?? ''} size="sm" />
              <div>
                <p className="text-xs text-gris-humo dark:text-dark-text2">Organizado por</p>
                <p className="text-sm font-medium text-gray-900 dark:text-dark-text">
                  {isCreator ? 'Ti' : `@${rehearsal.creator?.username}`}
                  {isCreator && <span className="ml-1 text-xs text-gris-humo dark:text-dark-text2">(tú)</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Date / location card */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2">Cuándo y dónde</h3>

          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-[#7F77DD] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{dateLabel}</p>
              {rehearsal.rehearsal_time && (
                <p className="text-xs text-gris-humo dark:text-dark-text2 flex items-center gap-1 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  {rehearsal.rehearsal_time.slice(0, 5)}
                  {rehearsal.duration_minutes && ` · ${rehearsal.duration_minutes} min`}
                </p>
              )}
              {customDatesSorted.length > 1 && (
                <button
                  onClick={() => setShowCustomDates((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 text-xs text-[#7F77DD] hover:underline"
                >
                  Ver todas las fechas
                  <ChevronDown className={cn('h-3 w-3 transition-transform', showCustomDates && 'rotate-180')} />
                </button>
              )}
              {showCustomDates && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customDatesSorted.map((d: string) => {
                    const [y, m, day] = d.split('-').map(Number)
                    return (
                      <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 text-[#534AB7] dark:text-violet-300">
                        {day} {MONTHS_ES[m - 1].slice(0, 3)} {y}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {(rehearsal.location || rehearsal.city) && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-[#7F77DD] flex-shrink-0 mt-0.5" />
              <div>
                {rehearsal.location && <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{rehearsal.location}</p>}
                {rehearsal.city && rehearsal.city !== rehearsal.location && (
                  <p className="text-xs text-gris-humo dark:text-dark-text2">{rehearsal.city}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* My RSVP (invitee only) */}
        {!isCreator && myInvite && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-3">Tu respuesta</h3>
            {localStatus === 'pending' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleRespond('accepted')}
                  disabled={responding}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Confirmar asistencia
                </button>
                <button
                  onClick={() => handleRespond('rejected')}
                  disabled={responding}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 text-sm font-medium py-2.5 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
              </div>
            ) : localStatus === 'accepted' ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Confirmaste asistencia</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 dark:text-dark-text2">
                <X className="h-5 w-5" />
                <span className="text-sm font-medium">Rechazaste la invitación</span>
              </div>
            )}
          </div>
        )}

        {/* Invitees */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-3 flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Integrantes
            <span className="ml-auto font-normal normal-case">
              {acceptedCount} confirmado{acceptedCount !== 1 ? 's' : ''}{pendingCount > 0 && `, ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
            </span>
          </h3>

          {invites.length === 0 ? (
            <p className="text-sm text-gris-humo dark:text-dark-text2">Sin invitados aún</p>
          ) : (
            <div className="space-y-2.5">
              {invites.map((invite: any) => (
                <div key={invite.id} className="flex items-center gap-2.5">
                  <Avatar src={invite.user?.avatar_url ?? null} name={invite.user?.full_name ?? ''} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                      @{invite.user?.username}
                      {invite.user_id === currentUserId && <span className="ml-1 text-xs text-gris-humo dark:text-dark-text2">(tú)</span>}
                    </p>
                    <p className="text-xs text-gris-humo dark:text-dark-text2">{invite.user?.full_name}</p>
                  </div>
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    invite.status === 'accepted'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : invite.status === 'rejected'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                  )}>
                    {invite.status === 'accepted' ? 'Confirmado' : invite.status === 'rejected' ? 'Rechazó' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coordination calendar */}
        {rehearsal.date_mode === 'coordinate' && rehearsal.coordinate_month && (isCreator || localStatus === 'accepted') && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gris-humo dark:text-dark-text2 mb-4">
              Disponibilidad del grupo
            </h3>
            <RehearsalCoordinationCalendar
              rehearsalId={rehearsal.id}
              coordinateMonth={rehearsal.coordinate_month}
            />
          </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditRehearsalModal
          rehearsal={rehearsal}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); reloadRehearsal() }}
          onCancelled={() => router.push('/feed')}
        />
      )}
    </div>
  )
}
