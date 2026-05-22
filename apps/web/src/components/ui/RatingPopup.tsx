'use client'

import { useEffect, useState } from 'react'
import { X, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import StarRating from './StarRating'


export interface PendingRating {
  teacherId: string
  teacherName: string
  classTitle: string
}

// Determines whether a class session has ended relative to enrollment date
function classSessionHasEnded(cls: any, enrollmentCreatedAt: string): boolean {
  const now = new Date()
  const enrolledAt = new Date(enrollmentCreatedAt)

  if (cls.type === 'suelta') {
    if (!cls.date || !cls.time) return false
    const [h, m] = (cls.time as string).split(':').map(Number)
    const classEnd = new Date(`${cls.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
    classEnd.setMinutes(classEnd.getMinutes() + (cls.duration_minutes ?? 60))
    return classEnd < now
  }

  // Custom dates
  if (cls.recurrence === 'custom' || (cls.custom_dates && cls.custom_dates.length > 0)) {
    const time = cls.recurring_time ?? cls.time ?? '00:00'
    const [h, m] = time.split(':').map(Number)
    return (cls.custom_dates ?? []).some((d: string) => {
      const sessionEnd = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      sessionEnd.setMinutes(sessionEnd.getMinutes() + (cls.duration_minutes ?? 60))
      return sessionEnd < now && new Date(`${d}T00:00:00`) >= enrolledAt
    })
  }

  // Weekly/biweekly/monthly — find the most recent past occurrence since enrollment
  if (cls.day_of_week != null && cls.recurring_time) {
    const [h, m] = (cls.recurring_time as string).split(':').map(Number)
    const today = new Date()
    const daysBack = (today.getDay() - cls.day_of_week + 7) % 7
    const candidate = new Date(today)
    candidate.setDate(today.getDate() - (daysBack === 0 ? 7 : daysBack))
    candidate.setHours(h, m, 0, 0)
    candidate.setMinutes(candidate.getMinutes() + (cls.duration_minutes ?? 60))
    if (candidate >= now) candidate.setDate(candidate.getDate() - 7)
    return candidate < now && candidate >= enrolledAt
  }

  return false
}

interface RatingPopupInnerProps {
  pending: PendingRating
  userId: string
  onDone: () => void
}

function RatingPopupInner({ pending, userId, onDone }: RatingPopupInnerProps) {
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)

  const labels: Record<number, string> = {
    1: 'Malo', 2: 'Regular', 3: 'Bueno', 4: 'Muy bueno', 5: 'Excelente',
  }

  async function handleRate() {
    if (selected < 1) return
    setLoading(true)
    await fetch('/api/ratings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rated_user_id: pending.teacherId, stars: selected }),
    })
    onDone()
  }

  function handleLater() {
    onDone()
  }

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-2xl bg-white dark:bg-dark-surface shadow-2xl border border-gray-100 dark:border-dark-border p-5">
        <button onClick={handleLater} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-dark-text2">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/10">
            <Star className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">¿Cómo fue tu clase?</p>
            <p className="text-xs text-gray-500 dark:text-dark-text2 mt-0.5">
              Tomaste <strong>{pending.classTitle}</strong> con <strong>{pending.teacherName}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 mb-4">
          <StarRating value={selected} onChange={setSelected} size="lg" />
          <p className="text-xs text-gray-500 dark:text-dark-text2 h-4">
            {selected > 0 ? labels[selected] ?? '' : 'Toca para valorar'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRate}
            disabled={loading || selected < 1}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : 'Publicar valoración'}
          </button>
          <button
            onClick={handleLater}
            className="rounded-xl border border-gray-200 dark:border-dark-border px-4 py-2.5 text-sm text-gray-600 dark:text-dark-text2 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors"
          >
            Después
          </button>
        </div>
      </div>
    </div>
  )
}

// Lazy loader: fetches pending ratings client-side after hydration
export default function RatingPopupLoader({ userId }: { userId: string }) {
  const [pending, setPending] = useState<PendingRating | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return
    async function checkPending() {
      const supabase = createClient()

      const [enrollmentsRes, givenRatingsRes] = await Promise.all([
        (supabase as any)
          .from('enrollments')
          .select('created_at, class:classes!inner(id, title, teacher_id, type, date, time, duration_minutes, recurrence, day_of_week, recurring_time, custom_dates, teacher:profiles!teacher_id(id, full_name))')
          .eq('student_id', userId)
          .eq('status', 'confirmed')
          .not('class.teacher_id', 'eq', userId)
          .limit(30),
        supabase.from('ratings' as any).select('rated_user_id').eq('rater_id', userId),
      ])

      const ratedTeacherIds = new Set(
        ((givenRatingsRes.data ?? []) as any[]).map((r: any) => r.rated_user_id)
      )

      const enrollments: any[] = enrollmentsRes.data ?? []

      // Group by teacher — one popup per teacher, newest class title
      const pendingByTeacher = new Map<string, PendingRating>()
      for (const e of enrollments) {
        const cls = e.class
        if (!cls || !cls.teacher) continue
        const teacherId = cls.teacher_id
        if (ratedTeacherIds.has(teacherId)) continue
        if (!classSessionHasEnded(cls, e.created_at)) continue
        if (!pendingByTeacher.has(teacherId)) {
          pendingByTeacher.set(teacherId, {
            teacherId,
            teacherName: cls.teacher.full_name,
            classTitle: cls.title,
          })
        }
      }

      const first = pendingByTeacher.values().next().value
      if (first) setPending(first)
    }

    checkPending()
  }, [userId, dismissed])

  if (!pending || dismissed) return null

  return (
    <RatingPopupInner
      pending={pending}
      userId={userId}
      onDone={() => setDismissed(true)}
    />
  )
}
