'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, Clock, Users, Check, X, ChevronDown, Pencil } from 'lucide-react'
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

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  return `${h}:${m}`
}

interface RehearsalCardProps {
  rehearsal: any
  currentUserId: string
  onRespond?: (inviteId: string, status: 'accepted' | 'rejected') => void
  onEdited?: () => void
  onCancelled?: (rehearsalId: string) => void
}

export default function RehearsalCard({ rehearsal, currentUserId, onRespond, onEdited, onCancelled }: RehearsalCardProps) {
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState<string | null>(rehearsal.my_invite?.status ?? null)
  const [showInvites, setShowInvites] = useState(false)
  const [showCoordination, setShowCoordination] = useState(false)
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
      if (res.ok) {
        setLocalStatus(status)
        onRespond?.(myInvite.id, status)
      }
    } finally {
      setResponding(false)
    }
  }

  const dateLabel = formatRehearsalDate(rehearsal)
  const timeLabel = rehearsal.rehearsal_time ? formatTime(rehearsal.rehearsal_time) : null

  return (
    <div className="bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border px-4 py-4">
      {/* Header: acento violeta (Morado Flow) para distinguir de clases */}
      <div className="flex items-start gap-3">
        <div className="w-1 rounded-full self-stretch flex-shrink-0 bg-[#7F77DD] min-h-[40px]" />
        <div className="flex-1 min-w-0">
          {/* Badge tipo + título + edit button */}
          <div className="flex items-start gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 text-[#534AB7] dark:text-violet-300">
                Ensayo
              </span>
              {rehearsal.dance_style && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-lavanda-suave dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2">
                  {rehearsal.dance_style}
                </span>
              )}
            </div>
            {isCreator && (
              <button
                onClick={() => setShowEdit(true)}
                className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-[#7F77DD] hover:bg-[#EEEDFE] dark:hover:bg-dark-surface2 transition-colors"
                title="Editar ensayo"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Link href={`/rehearsal/${rehearsal.id}`} className="block hover:opacity-80 transition-opacity">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text text-base leading-tight">
              {rehearsal.title}
            </h3>
          </Link>

          {/* Creador */}
          <div className="flex items-center gap-1.5 mt-1">
            <Avatar
              src={rehearsal.creator?.avatar_url ?? null}
              name={rehearsal.creator?.full_name ?? ''}
              size="xs"
            />
            <span className="text-xs text-gris-humo dark:text-dark-text2">
              {isCreator ? 'Tú organizas' : `@${rehearsal.creator?.username}`}
            </span>
          </div>
        </div>
      </div>

      {/* Descripción */}
      {rehearsal.description && (
        <p className="mt-2 text-sm text-gray-700 dark:text-dark-text2 leading-relaxed ml-4">
          {rehearsal.description}
        </p>
      )}

      {/* Metadata */}
      <div className="mt-3 ml-4 space-y-1.5">
        <div className="flex items-center gap-1.5 text-sm text-gris-humo dark:text-dark-text2">
          <Calendar className="h-4 w-4 flex-shrink-0 text-[#7F77DD]" />
          <span>{dateLabel}</span>
          {timeLabel && (
            <>
              <span>·</span>
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{timeLabel}</span>
              {rehearsal.duration_minutes && rehearsal.duration_minutes !== 60 && (
                <span className="text-xs">({rehearsal.duration_minutes} min)</span>
              )}
            </>
          )}
        </div>

        {(rehearsal.location || rehearsal.city) && (
          <div className="flex items-center gap-1.5 text-sm text-gris-humo dark:text-dark-text2">
            <MapPin className="h-4 w-4 flex-shrink-0 text-[#7F77DD]" />
            <span>{rehearsal.location ?? rehearsal.city}</span>
          </div>
        )}
      </div>

      {/* Integrantes */}
      {invites.length > 0 && (
        <div className="mt-3 ml-4">
          <button
            onClick={() => setShowInvites((v) => !v)}
            className="flex items-center gap-2 text-xs text-gris-humo dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            <span>
              {acceptedCount > 0 && `${acceptedCount} confirmado${acceptedCount !== 1 ? 's' : ''}`}
              {acceptedCount > 0 && pendingCount > 0 && ', '}
              {pendingCount > 0 && `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
            </span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', showInvites && 'rotate-180')} />
          </button>

          {showInvites && (
            <div className="mt-2 space-y-1.5">
              {invites.map((invite: any) => (
                <div key={invite.id} className="flex items-center gap-2">
                  <Avatar
                    src={invite.user?.avatar_url ?? null}
                    name={invite.user?.full_name ?? ''}
                    size="xs"
                  />
                  <span className="text-xs text-gray-700 dark:text-dark-text2">
                    @{invite.user?.username}
                  </span>
                  <span className={cn(
                    'ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full',
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
      )}

      {/* Coordinación de horarios (modo coordinate) */}
      {rehearsal.date_mode === 'coordinate' && (isCreator || localStatus === 'accepted') && (
        <div className="mt-3 ml-4">
          <button
            onClick={() => setShowCoordination((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#7F77DD] hover:text-[#6B64C8] transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            {showCoordination ? 'Ocultar disponibilidad' : 'Ver disponibilidad del grupo'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showCoordination && 'rotate-180')} />
          </button>
          {showCoordination && rehearsal.coordinate_month && (
            <div className="mt-3">
              <RehearsalCoordinationCalendar
                rehearsalId={rehearsal.id}
                coordinateMonth={rehearsal.coordinate_month}
              />
            </div>
          )}
        </div>
      )}

      {/* Acciones para invitados con invitación pendiente */}
      {!isCreator && myInvite && (
        <div className="mt-3 ml-4">
          {localStatus === 'pending' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-dark-text2 mr-1">¿Vas?</span>
              <button
                onClick={() => handleRespond('accepted')}
                disabled={responding}
                className="flex items-center gap-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Confirmar
              </button>
              <button
                onClick={() => handleRespond('rejected')}
                disabled={responding}
                className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text2 text-xs font-medium px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </div>
          ) : localStatus === 'accepted' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Confirmaste asistencia
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-dark-text2">
              <X className="h-3.5 w-3.5" />
              Rechazaste la invitación
            </span>
          )}
        </div>
      )}

      {/* Edit modal (creator only) */}
      {showEdit && (
        <EditRehearsalModal
          rehearsal={rehearsal}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onEdited?.() }}
          onCancelled={() => { setShowEdit(false); onCancelled?.(rehearsal.id) }}
        />
      )}
    </div>
  )
}
