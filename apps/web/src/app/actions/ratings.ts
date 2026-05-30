'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface RatingResult {
  ok: boolean
  avgRating?: number
  ratingCount?: number
  error?: string
}

export async function submitRating(params: { rated_user_id: string; stars: number }): Promise<RatingResult> {
  const { rated_user_id, stars } = params

  if (!rated_user_id || typeof stars !== 'number' || stars < 1 || stars > 5) {
    return { ok: false, error: 'Parámetros inválidos' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  if (user.id === rated_user_id) return { ok: false, error: 'No puedes valorarte a ti mismo' }

  const admin = createAdminClient()

  // Verify eligibility: confirmed enrollment, class already happened
  const { data: enrollments } = await (admin as any)
    .from('enrollments')
    .select('id, created_at, class:classes!inner(teacher_id, type, date)')
    .eq('student_id', user.id)
    .eq('status', 'confirmed')
    .eq('class.teacher_id', rated_user_id)

  const todayStr = new Date().toISOString().split('T')[0]
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000

  const eligible = ((enrollments as any[]) ?? []).some((e: any) => {
    const cls = e.class
    if (!cls) return false
    if (cls.type === 'suelta') return cls.date && cls.date < todayStr
    return new Date(e.created_at).getTime() <= weekAgoMs
  })

  if (!eligible) {
    return { ok: false, error: 'No puedes calificar aún — espera a que la clase ocurra' }
  }

  const { error } = await (admin as any)
    .from('ratings')
    .upsert({ rater_id: user.id, rated_user_id, stars }, { onConflict: 'rater_id,rated_user_id' })

  if (error) return { ok: false, error: 'No se pudo guardar la valoración' }

  const { data: rows } = await (admin as any)
    .from('ratings')
    .select('stars')
    .eq('rated_user_id', rated_user_id)
  const ratingCount = (rows ?? []).length
  const avgRating =
    ratingCount > 0
      ? Math.round(((rows as any[]).reduce((a: number, r: any) => a + Number(r.stars), 0) / ratingCount) * 10) / 10
      : 0

  return { ok: true, avgRating, ratingCount }
}
