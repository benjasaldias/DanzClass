import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  // Support both cookie auth (web) and Bearer token (mobile)
  let userId: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await admin.auth.getUser(authHeader.slice(7))
    userId = user?.id ?? null
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }

  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rlHit = await checkRateLimit(`ratings:${userId}`, 'social')
  if (rlHit) return rlHit

  const body = await req.json().catch(() => ({}))
  const { rated_user_id, stars } = body

  if (!rated_user_id || typeof stars !== 'number' || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  if (userId === rated_user_id) {
    return NextResponse.json({ error: 'Cannot rate yourself' }, { status: 400 })
  }

  // D-5: además de inscripción confirmada, exigir que la clase ya haya ocurrido.
  // - Sueltas: class.date < today.
  // - Periódicas/entrenamientos/custom: enrollment con ≥ 7 días (heurística "al menos una sesión cumplida").
  const { data: enrollments } = await (admin as any)
    .from('enrollments')
    .select('id, created_at, class:classes!inner(teacher_id, type, date)')
    .eq('student_id', userId)
    .eq('status', 'confirmed')
    .eq('class.teacher_id', rated_user_id)

  const todayStr = new Date().toISOString().split('T')[0]
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000

  const eligible = ((enrollments as any[]) ?? []).some((e: any) => {
    const cls = e.class
    if (!cls) return false
    if (cls.type === 'suelta') {
      return cls.date && cls.date < todayStr
    }
    return new Date(e.created_at).getTime() <= weekAgoMs
  })

  if (!eligible) {
    return NextResponse.json(
      { error: 'Not eligible — esperar a que la clase ocurra para calificar' },
      { status: 403 }
    )
  }

  const { error } = await (admin as any)
    .from('ratings')
    .upsert({ rater_id: userId, rated_user_id, stars }, { onConflict: 'rater_id,rated_user_id' })

  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })

  // Return updated avg
  const { data: rows } = await (admin as any)
    .from('ratings').select('stars').eq('rated_user_id', rated_user_id)
  const ratingCount = (rows ?? []).length
  const avgRating = ratingCount > 0
    ? Math.round(((rows as any[]).reduce((a: number, r: any) => a + Number(r.stars), 0) / ratingCount) * 10) / 10
    : 0

  return NextResponse.json({ ok: true, avgRating, ratingCount })
}
