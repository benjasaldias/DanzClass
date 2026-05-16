'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Clock, Users, ChevronRight, Music2, Calendar } from 'lucide-react'
import { cn, timeAgo, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'

interface ClassCardProps {
  classData: any
  currentUserId: string
  currentUserRole?: string
}

const LEVEL_COLORS = {
  principiante: 'bg-green-100 text-green-700',
  intermedio: 'bg-yellow-100 text-yellow-700',
  avanzado: 'bg-red-100 text-red-700',
  todos: 'bg-blue-100 text-blue-700',
}

export default function ClassCard({ classData, currentUserId, currentUserRole }: ClassCardProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const teacher = classData.teacher
  const media: any[] = classData.media ?? []
  const sortedMedia = media.sort((a: any, b: any) => a.order_index - b.order_index)
  const isTeacher = classData.teacher_id === currentUserId

  const confirmedCount = (classData.enrollments ?? []).filter((e: any) => e.status === 'confirmed').length
  const spotsAvailable = (classData.max_spots ?? 0) - confirmedCount

  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const scheduleText = classData.type === 'suelta'
    ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
    : classData.recurrence === 'custom'
      ? `${classData.custom_dates?.length ?? 0} clase${(classData.custom_dates?.length ?? 0) !== 1 ? 's' : ''} · ${formatTime(classData.recurring_time)}`
      : `${recurrenceLabel[classData.recurrence] ?? ''} · ${DAYS_OF_WEEK[classData.day_of_week]} ${formatTime(classData.recurring_time)}`

  const styleBadge = classData.dance_style
    ? classData.class_type
      ? `${classData.dance_style} - ${classData.class_type}`
      : classData.dance_style
    : null

  return (
    <article className="border-b border-gray-100 bg-violet-50/30">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/teacher/${teacher.username}`}>
          <Avatar src={teacher.avatar_url} name={teacher.full_name} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/teacher/${teacher.username}`} className="flex items-center gap-1">
            <span className="font-semibold text-sm text-gray-900 truncate">{teacher.full_name}</span>
          </Link>
          <p className="text-xs text-gray-500">{timeAgo(classData.created_at)}</p>
        </div>
        {styleBadge && (
          <span className="badge bg-brand-50 text-brand-700 text-xs">{styleBadge}</span>
        )}
      </div>

      {/* Media carousel */}
      {sortedMedia.length > 0 && (
        <div className="relative aspect-square bg-gray-100">
          {sortedMedia[currentMediaIndex].type === 'image' ? (
            <Image
              src={sortedMedia[currentMediaIndex].url}
              alt={classData.title}
              fill
              className="object-cover"
              sizes="(max-width: 512px) 100vw, 512px"
            />
          ) : (
            <video
              src={sortedMedia[currentMediaIndex].url}
              className="w-full h-full object-cover"
              controls
              playsInline
            />
          )}

          {/* Dot indicators */}
          {sortedMedia.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {sortedMedia.map((_: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentMediaIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === currentMediaIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="px-4 pb-4 pt-3 space-y-3">
        {/* Title + level */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-gray-900 leading-snug">{classData.title}</h3>
          <span className={cn('badge flex-shrink-0', LEVEL_COLORS[classData.level as keyof typeof LEVEL_COLORS] ?? 'bg-gray-100 text-gray-600')}>
            {classData.level}
          </span>
        </div>

        {/* Description */}
        {classData.description && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{classData.description}</p>
        )}

        {/* Details */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>{scheduleText}</span>
          </div>
          {classData.location_name && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span>{classData.location_name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>{classData.duration_minutes} min</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>
              <span className={cn('font-medium', spotsAvailable <= 0 ? 'text-red-600' : 'text-green-700')}>
                {Math.max(0, spotsAvailable)}
              </span>
              /{classData.max_spots} cupos disponibles
            </span>
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-xs text-gray-500">
              {classData.type === 'periodica' || classData.type === 'entrenamiento' ? 'Precio mensual' : 'Precio'}
            </p>
            {classData.discount_price_monthly && classData.type !== 'suelta' ? (
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-orange-600">{formatCLP(classData.discount_price_monthly)}</p>
                <p className="text-sm text-gray-400 line-through">{formatCLP(classData.price)}</p>
              </div>
            ) : classData.discount_price && classData.type === 'suelta' ? (
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-orange-600">{formatCLP(classData.discount_price)}</p>
                <p className="text-sm text-gray-400 line-through">{formatCLP(classData.price)}</p>
              </div>
            ) : (
              <p className="text-xl font-bold text-gray-900">{formatCLP(classData.price)}</p>
            )}
            {classData.price_suelta && (
              <p className="text-xs text-gray-500 mt-0.5">
                Suelta:{' '}
                {classData.discount_price ? (
                  <>
                    <span className="font-medium text-orange-600">{formatCLP(classData.discount_price)}</span>
                    <span className="line-through text-gray-400 ml-1">{formatCLP(classData.price_suelta)}</span>
                  </>
                ) : (
                  <span className="font-medium text-gray-700">{formatCLP(classData.price_suelta)}</span>
                )}
              </p>
            )}
            {classData.price_2x && (
              <p className="text-xs text-brand-600 mt-0.5 font-medium">
                2x: {formatCLP(classData.price_2x)}
              </p>
            )}
          </div>

          {!isTeacher && (
            <Link href={`/class/${classData.id}`} className="btn-primary">
              Ver clase
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}

          {isTeacher && (
            <Link href={`/class/${classData.id}/edit`} className="btn-secondary text-xs">
              Editar
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
