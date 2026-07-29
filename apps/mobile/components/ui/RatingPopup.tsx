import { useState, useEffect } from 'react'
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { upsertRating } from '../../lib/ratings'
import StarRating from './StarRating'

interface PendingRating {
  teacherId: string
  teacherName: string
}

const STAR_LABELS: Record<number, string> = {
  1: 'Malo', 1.5: 'Malo', 2: 'Regular', 2.5: 'Regular',
  3: 'Bueno', 3.5: 'Bueno', 4: 'Muy bueno', 4.5: 'Excelente', 5: 'Excelente',
}

function classSessionHasEnded(c: any): boolean {
  const now = Date.now()
  const dur = (c.duration_minutes ?? 60) * 60 * 1000

  if (c.type === 'suelta') {
    if (!c.date || !c.time) return false
    const end = new Date(`${c.date}T${c.time}`).getTime() + dur
    return end < now
  }

  if (c.type === 'custom') {
    const dates: string[] = c.custom_dates ?? []
    const time = c.recurring_time ?? '00:00'
    return dates.some((d) => new Date(`${d}T${time}`).getTime() + dur < now)
  }

  // recurring / entrenamiento — check weekly occurrences going back up to 16 weeks
  if (c.day_of_week == null || !c.recurring_time) return false
  const ref = new Date()
  for (let i = 1; i <= 16; i++) {
    const d = new Date(ref)
    d.setDate(ref.getDate() - i)
    if (d.getDay() === c.day_of_week) {
      const [h, m] = c.recurring_time.split(':').map(Number)
      d.setHours(h, m, 0, 0)
      if (d.getTime() + dur < now) return true
    }
  }
  return false
}

interface RatingPopupProps {
  userId: string
}

export default function RatingPopup({ userId }: RatingPopupProps) {
  const [pending, setPending] = useState<PendingRating | null>(null)
  const [stars, setStars] = useState(0)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function check() {
      const [{ data: enrollments }, { data: myRatings }] = await Promise.all([
        (supabase as any)
          .from('enrollments')
          .select('class:classes!class_id(id, type, date, time, day_of_week, recurring_time, custom_dates, duration_minutes, teacher_id, teacher:profiles!teacher_id(id, full_name))')
          // `enrollments` no tiene `user_id` (es `student_id`): con la columna
          // equivocada PostgREST devolvía error y el popup no aparecía nunca.
          .eq('student_id', userId)
          .eq('status', 'confirmed'),
        (supabase as any)
          .from('ratings')
          .select('rated_user_id')
          .eq('rater_id', userId),
      ])

      const ratedIds = new Set((myRatings ?? []).map((r: any) => r.rated_user_id))
      const seen = new Set<string>()

      for (const e of (enrollments ?? [])) {
        const cls = e.class
        if (!cls || !cls.teacher) continue
        const tid = cls.teacher_id
        if (tid === userId) continue
        if (ratedIds.has(tid)) continue
        if (seen.has(tid)) continue
        if (!classSessionHasEnded(cls)) continue
        seen.add(tid)
        setPending({ teacherId: tid, teacherName: cls.teacher.full_name })
        break
      }
    }
    check()
  }, [userId])

  async function handleSubmit() {
    if (!pending || stars < 1) return
    setLoading(true)
    const res = await upsertRating(pending.teacherId, stars)
    setLoading(false)
    if (!res.ok) {
      Alert.alert('No se pudo valorar', res.error)
      return
    }
    setDismissed(true)
  }

  if (!pending || dismissed) return null

  return (
    <Modal transparent animationType="slide" visible={!dismissed} onRequestClose={() => setDismissed(true)}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View className="bg-white dark:bg-dark-surface rounded-t-3xl px-6 pb-10 pt-6 gap-4">
          <View className="w-10 h-1 rounded-full bg-gray-200 dark:bg-dark-border self-center mb-2" />
          <Text className="text-lg font-bold text-gray-900 dark:text-dark-text text-center">
            ¿Cómo fue la clase?
          </Text>
          <Text className="text-sm text-gray-500 dark:text-dark-text2 text-center">
            Valora a {pending.teacherName}
          </Text>

          <View className="items-center gap-2 py-2">
            <StarRating value={stars} onChange={setStars} size="lg" />
            {stars >= 1 && (
              <Text className="text-sm text-brand-600">{STAR_LABELS[stars] ?? ''}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={stars < 1 || loading}
            className={`rounded-2xl py-3.5 items-center ${stars >= 1 ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className={`font-semibold text-base ${stars >= 1 ? 'text-white' : 'text-gray-400 dark:text-dark-text2'}`}>
                Enviar valoración
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setDismissed(true)} className="items-center py-1">
            <Text className="text-sm text-gray-400 dark:text-dark-text2">Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
