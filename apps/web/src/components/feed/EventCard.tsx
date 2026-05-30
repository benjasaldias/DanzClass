'use client'

import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Calendar, Users, Ticket, Trophy, Star, BookOpen } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'

const EVENT_TYPE_COLORS = {
  batalla: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  masterclass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  otro: 'bg-gray-100 text-gray-600 dark:bg-dark-surface2 dark:text-dark-text2',
}

const EVENT_TYPE_ICONS = {
  batalla: Trophy,
  masterclass: BookOpen,
  otro: Star,
}

interface EventCardProps {
  event: any
  currentUserId: string
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

export default function EventCard({ event, currentUserId }: EventCardProps) {
  const eventType = event.event_type as keyof typeof EVENT_TYPE_LABELS
  const TypeIcon = EVENT_TYPE_ICONS[eventType] ?? Star
  const acceptedInvites: any[] = event.event_invites?.filter((i: any) => i.status === 'accepted') ?? []
  const enrolledCount = event.event_enrollments?.filter((e: any) => e.status !== 'cancelled').length ?? 0
  const isFull = event.has_spots && event.max_spots != null && enrolledCount >= event.max_spots

  return (
    <Link href={`/event/${event.id}`} className="block">
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden hover:shadow-md transition-shadow">
        {/* Cover image */}
        {event.cover_url ? (
          <div className="relative w-full aspect-video bg-gray-100 dark:bg-dark-surface2">
            <Image
              src={event.cover_url}
              alt={event.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 600px"
            />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm">
              <TypeIcon className="h-3.5 w-3.5 text-white" />
              <span className="text-xs font-semibold text-white">{EVENT_TYPE_LABELS[eventType]}</span>
            </div>
            {isFull && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold">
                Lleno
              </div>
            )}
          </div>
        ) : (
          <div className="w-full aspect-video bg-gradient-to-br from-violet-100 to-brand-50 dark:from-dark-surface2 dark:to-dark-surface flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <TypeIcon className="h-10 w-10 text-brand-400" />
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                {EVENT_TYPE_LABELS[eventType]}
              </span>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 dark:text-dark-text text-base leading-tight line-clamp-2">
                {event.title}
              </h3>
            </div>
            {!event.cover_url && (
              <span className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_TYPE_COLORS[eventType]}`}>
                <TypeIcon className="h-3 w-3" />
                {EVENT_TYPE_LABELS[eventType]}
              </span>
            )}
          </div>

          {/* Organizer */}
          <div className="flex items-center gap-2">
            <Avatar
              url={event.creator?.avatar_url}
              name={event.creator?.full_name}
              size={24}
            />
            <span className="text-sm text-gray-600 dark:text-dark-text2">
              Organiza{' '}
              <Link
                href={`/teacher/${event.creator?.username}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-gray-900 dark:text-dark-text hover:text-brand-600"
              >
                @{event.creator?.username}
              </Link>
            </span>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-500 dark:text-dark-text2">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-brand-500 shrink-0" />
              {formatEventDate(event.event_date)}
              {event.event_time && ` · ${event.event_time}`}
            </span>
            {event.city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-500 shrink-0" />
                {event.city}
              </span>
            )}
          </div>

          {/* Invited teachers */}
          {acceptedInvites.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {acceptedInvites.slice(0, 3).map((invite: any) => (
                <Link
                  key={invite.id}
                  href={`/teacher/${invite.teacher?.username}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-full text-xs text-violet-700 dark:text-violet-400 hover:bg-violet-100 transition-colors"
                >
                  <Avatar url={invite.teacher?.avatar_url} name={invite.teacher?.full_name} size={16} />
                  @{invite.teacher?.username}
                </Link>
              ))}
              {acceptedInvites.length > 3 && (
                <span className="text-xs text-gray-500 dark:text-dark-text2 self-center">
                  +{acceptedInvites.length - 3} profes
                </span>
              )}
            </div>
          )}

          {/* Footer: cupos + entrada */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-dark-border">
            <div className="flex items-center gap-3">
              {event.has_spots && (
                <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-dark-text2">
                  <Users className="h-4 w-4" />
                  {enrolledCount}/{event.max_spots} cupos
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {event.has_entry ? (
                <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg px-2.5 py-1">
                  <Ticket className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCLP(event.entry_price ?? 0)}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-gray-400 dark:text-dark-text2">Entrada libre</span>
              )}
              <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
                Ver más →
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
