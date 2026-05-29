'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Calendar, Users, ChevronRight, ChevronLeft, Share2, Play } from 'lucide-react'
import { cn, timeAgo, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK, LEVEL_LABELS } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'
import StarRating from '@/components/ui/StarRating'

interface TeacherRating {
  avg_stars: number
  rating_count: number
}

interface ClassCardProps {
  classData: any
  currentUserId: string
  currentUserRole?: string
  teacherRating?: TeacherRating
}

const LEVEL_COLORS = {
  principiante: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  intermedio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  avanzado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  todos: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

export default function ClassCard({ classData, currentUserId, currentUserRole, teacherRating }: ClassCardProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(`${window.location.origin}/class/${classData.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function togglePlay(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  function handlePrev(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setCurrentMediaIndex((i) => (i === 0 ? sortedMedia.length - 1 : i - 1))
    setIsPlaying(false)
  }

  function handleNext(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setCurrentMediaIndex((i) => (i === sortedMedia.length - 1 ? 0 : i + 1))
    setIsPlaying(false)
  }

  const teacher = classData.teacher
  const media: any[] = classData.media ?? []
  const sortedMedia = media.sort((a: any, b: any) => a.order_index - b.order_index)
  const hasMedia = sortedMedia.length > 0
  const currentMedia = sortedMedia[currentMediaIndex]

  const takenCount = (classData.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
  const spotsAvailable = Math.max(0, (classData.max_spots ?? 0) - takenCount)

  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

  function customDatesPreview(dates: string[], time: string): string {
    if (!dates || dates.length === 0) return `0 clases · ${formatTime(time)}`
    const sorted = [...dates].sort()
    const preview = sorted.slice(0, 3).map((d) => {
      const [, m, day] = d.split('-')
      return `${parseInt(day)}/${parseInt(m)}`
    }).join(', ')
    const suffix = sorted.length > 3 ? `... · ${sorted.length} clases` : `· ${sorted.length} clase${sorted.length !== 1 ? 's' : ''}`
    return `${preview} ${suffix} · ${formatTime(time)}`
  }

  const scheduleText = classData.type === 'suelta'
    ? `${formatDate(classData.date)} · ${formatTime(classData.time)}`
    : classData.recurrence === 'custom'
      ? customDatesPreview(classData.custom_dates, classData.recurring_time)
      : `${recurrenceLabel[classData.recurrence] ?? ''} · ${DAYS_OF_WEEK[classData.day_of_week]} ${formatTime(classData.recurring_time)}`

  const styleBadge = classData.dance_style
    ? classData.class_type
      ? `${classData.dance_style} - ${classData.class_type}`
      : classData.dance_style
    : null

  return (
    <article className="mx-3 mb-4 rounded-2xl shadow-sm overflow-hidden bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-border">

      {/* ── CON MEDIA ────────────────────────────────────── */}
      {hasMedia && (
        <>
          {/* Hero image / video — portrait 4:5 */}
          <div className="relative aspect-[4/5] bg-gray-100 dark:bg-dark-surface2 overflow-hidden">
            {currentMedia.type === 'image' ? (
              <Image
                src={currentMedia.url}
                alt={classData.title}
                fill
                className="object-cover"
                sizes="(max-width: 512px) 100vw, 512px"
                loading="lazy"
              />
            ) : (
              /* Video sin controles — estilo Instagram/TikTok */
              <div className="w-full h-full relative cursor-pointer" onClick={togglePlay}>
                <video
                  ref={videoRef}
                  src={currentMedia.url}
                  className="w-full h-full object-cover"
                  playsInline
                  loop
                  preload="metadata"
                  onEnded={() => setIsPlaying(false)}
                />
                {/* Play button overlay cuando está pausado */}
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-black/50 backdrop-blur-sm p-4">
                      <Play className="h-8 w-8 text-white fill-white" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Share — top left */}
            <button
              onClick={handleShare}
              title={copied ? '¡Copiado!' : 'Compartir clase'}
              className="absolute top-3 left-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
              aria-label="Compartir clase"
            >
              <Share2 className={cn('h-4 w-4', copied ? 'text-green-400' : 'text-white')} />
            </button>

            {/* Style badge — top right */}
            {styleBadge && (
              <span className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-xs font-bold bg-black/50 backdrop-blur-sm text-white uppercase tracking-wide">
                {styleBadge}
              </span>
            )}

            {/* Teacher overlay — bottom gradient */}
            <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 py-3">
              <Link href={`/teacher/${teacher.username}`} className="flex items-center gap-2.5">
                <Avatar src={teacher.avatar_url} name={teacher.full_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">{teacher.full_name}</p>
                  {teacherRating && teacherRating.rating_count > 0 ? (
                    <div className="mt-0.5">
                      <StarRating value={teacherRating.avg_stars} count={teacherRating.rating_count} size="sm" />
                    </div>
                  ) : (
                    <p className="text-xs text-white/70">{timeAgo(classData.created_at)}</p>
                  )}
                </div>
              </Link>
            </div>
          </div>

          {/* Carousel nav — dots + flechas, entre imagen y contenido */}
          {sortedMedia.length > 1 && (
            <div className="flex items-center justify-center gap-3 py-2 border-b border-gray-100 dark:border-dark-border">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:text-dark-text2 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex gap-1.5 items-center">
                {sortedMedia.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => { setCurrentMediaIndex(i); setIsPlaying(false) }}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === currentMediaIndex
                        ? 'w-4 bg-brand-600 dark:bg-brand-400'
                        : 'w-1.5 bg-gray-300 dark:bg-dark-border'
                    )}
                    aria-label={`Ir a imagen ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:text-dark-text2 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── SIN MEDIA: cabecera con profesor ─────────────── */}
      {!hasMedia && (
        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-dark-border">
          <Link href={`/teacher/${teacher.username}`} className="flex items-center gap-2.5 min-w-0">
            <Avatar src={teacher.avatar_url} name={teacher.full_name} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate leading-tight">{teacher.full_name}</p>
              {teacherRating && teacherRating.rating_count > 0 ? (
                <div className="mt-0.5">
                  <StarRating value={teacherRating.avg_stars} count={teacherRating.rating_count} size="sm" />
                </div>
              ) : (
                <p className="text-xs text-gris-humo dark:text-dark-text2">{timeAgo(classData.created_at)}</p>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            {styleBadge && (
              <span className="badge bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs uppercase font-semibold">
                {styleBadge}
              </span>
            )}
            <button
              onClick={handleShare}
              title={copied ? '¡Copiado!' : 'Compartir clase'}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-surface2 hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
              aria-label="Compartir clase"
            >
              <Share2 className={cn('h-4 w-4', copied ? 'text-green-500' : 'text-gris-humo dark:text-dark-text2')} />
            </button>
          </div>
        </div>
      )}

      {/* ── CONTENIDO ────────────────────────────────────── */}
      <div className={cn('px-4 pb-4 space-y-2.5', hasMedia ? 'pt-3' : 'pt-4')}>
        {/* Title */}
        <h3 className="font-bold text-gray-900 dark:text-dark-text leading-snug">{classData.title}</h3>

        {/* Description */}
        {classData.description && (
          <p className="text-sm text-gray-500 dark:text-dark-text2 leading-relaxed line-clamp-2">{classData.description}</p>
        )}

        {/* Meta rows */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gris-humo dark:text-dark-text2">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text2 flex-shrink-0" />
            <span>{scheduleText}</span>
          </div>
          {classData.location_name && (
            <div className="flex items-center gap-2 text-sm text-gris-humo dark:text-dark-text2">
              <MapPin className="h-4 w-4 text-gray-400 dark:text-dark-text2 flex-shrink-0" />
              <span>{classData.location_name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gris-humo dark:text-dark-text2">
            <Users className="h-4 w-4 text-gray-400 dark:text-dark-text2 flex-shrink-0" />
            <span>
              <span className={cn('font-medium', spotsAvailable <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-emerald-400')}>
                {spotsAvailable}
              </span>
              /{classData.max_spots} cupos disponibles
            </span>
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex items-end justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-xs text-gris-humo dark:text-dark-text2 mb-0.5">
              {classData.type === 'periodica' || classData.type === 'entrenamiento' ? 'Precio mensual' : 'Precio'}
            </p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {classData.discount_price_monthly && classData.type !== 'suelta' ? (
                <>
                  <span className="text-lg font-bold text-coral-fuego">{formatCLP(classData.discount_price_monthly)}</span>
                  <span className="text-xs text-gray-400 line-through">{formatCLP(classData.price)}</span>
                </>
              ) : classData.discount_price && classData.type === 'suelta' ? (
                <>
                  <span className="text-lg font-bold text-coral-fuego">{formatCLP(classData.discount_price)}</span>
                  <span className="text-xs text-gray-400 line-through">{formatCLP(classData.price)}</span>
                </>
              ) : (
                <span className="text-lg font-bold text-gray-900 dark:text-dark-text">{formatCLP(classData.price)}</span>
              )}
              {classData.price_2x && (
                <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">· 2x {formatCLP(classData.price_2x)}</span>
              )}
            </div>
            {classData.price_suelta && (
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className="text-xs text-gris-humo dark:text-dark-text2">Suelta:</span>
                {classData.discount_price ? (
                  <>
                    <span className="text-xs font-medium text-coral-fuego">{formatCLP(classData.discount_price)}</span>
                    <span className="text-xs line-through text-gray-400">{formatCLP(classData.price_suelta)}</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-gray-700 dark:text-dark-text">{formatCLP(classData.price_suelta)}</span>
                )}
                {classData.price_suelta_2x && (
                  <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">· 2x {formatCLP(classData.price_suelta_2x)}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn('badge text-xs', LEVEL_COLORS[classData.level as keyof typeof LEVEL_COLORS] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>
              {LEVEL_LABELS[classData.level as keyof typeof LEVEL_LABELS] ?? classData.level}
            </span>
            <Link href={`/class/${classData.id}`} className="btn-primary">
              Ver clase
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
