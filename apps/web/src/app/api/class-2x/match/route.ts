import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'
import { assertCanEnroll, loadEnrollableClass } from '@/lib/enrollGuards'
import { twoxClassPrice } from '@danceclass/shared'

export async function POST(req: NextRequest) {
  let user: any = null

  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const mobileSupa = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await mobileSupa.auth.getUser()
    user = data.user
  }
  if (!user) {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rlHit = await checkRateLimit(`enroll:${user.id}`, 'enroll')
  if (rlHit) return rlHit

  const { request_id } = await req.json()
  if (!request_id) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch the 2x request
  const { data: request, error: reqErr } = await admin
    .from('class_2x_requests' as any)
    .select('*')
    .eq('id', request_id)
    .eq('status', 'looking')
    .single()

  if (reqErr || !request) {
    return NextResponse.json({ error: 'Request not found or already matched' }, { status: 404 })
  }

  const req2x = request as any
  if (req2x.user_id === user.id) {
    return NextResponse.json({ error: 'Cannot match with yourself' }, { status: 400 })
  }

  // audit3 P0-2: esta ruta crea DOS inscripciones y no repetía ninguna de las
  // validaciones de `/api/class/enroll`. La solicitud 2x la inserta el propio
  // alumno (la policy sólo exige `user_id = auth.uid()`), así que era la puerta
  // lateral para entrar a un entrenamiento con audición obligatoria, a una clase
  // vencida o a una cancelada — sin que ninguna pantalla ofreciera el botón.
  const cls = await loadEnrollableClass(admin, req2x.class_id)
  if (!cls) {
    return NextResponse.json({ error: 'class_unavailable' }, { status: 404 })
  }

  // Los dos alumnos, no sólo quien matchea: el bloqueo del compañero también
  // impide el emparejamiento (si él no puede entrar, no hay 2x que armar).
  for (const candidate of [req2x.user_id, user.id]) {
    const block = await assertCanEnroll(admin, cls, candidate)
    if (block) {
      return NextResponse.json(
        { error: block.error, blocked: candidate === user.id ? 'you' : 'partner' },
        { status: block.status }
      )
    }
  }

  // Un 2x se paga UNA vez, con el precio 2x de la clase. Sin ese precio
  // configurado, ni `create-payment` ni `submit-transfer` pueden cobrarlo
  // (ambos responden `twox_price_missing`): emparejar dejaría a los dos con un
  // cupo impagable, que es justo lo que evita el guard de vía de pago.
  if (!twoxClassPrice(cls)) {
    return NextResponse.json({ error: 'twox_price_missing' }, { status: 400 })
  }

  // Check neither is already enrolled
  const { data: existingEnrollments } = await admin
    .from('enrollments')
    .select('id, student_id')
    .eq('class_id', req2x.class_id)
    .in('student_id', [req2x.user_id, user.id])
    .in('status', ['pending_payment', 'payment_submitted', 'confirmed'])

  if (existingEnrollments && existingEnrollments.length > 0) {
    return NextResponse.json({ error: 'One of you is already enrolled' }, { status: 400 })
  }

  // Un 2x ocupa DOS cupos. El trigger de capacidad (056) igual lo impediría,
  // pero recién al insertar la segunda fila: sin este chequeo, la ruta borraba
  // la primera y devolvía un 500 genérico donde correspondía un "no hay cupos".
  const { data: spotsData } = await (admin as any)
    .from('class_spots')
    .select('spots_available')
    .eq('class_id', req2x.class_id)
    .maybeSingle()
  if ((spotsData?.spots_available ?? 0) < 2) {
    return NextResponse.json({ error: 'no_spots' }, { status: 409 })
  }

  // Reclamar la solicitud ANTES de crear las inscripciones (audit3 P0-2).
  //
  // El filtro `status='looking'` estaba sólo en el SELECT de arriba, no en este
  // UPDATE, así que dos matchers concurrentes pasaban los dos y el choque lo
  // ataja recién el índice único de inscripciones (056) con un 500 genérico —
  // aunque `CLAUDE.md` documentaba que el segundo recibe 404. Con el
  // compare-and-set acá, este UPDATE es el único punto que serializa la carrera
  // y el segundo recibe el 404 que la documentación ya prometía.
  //
  // El error NO se puede ignorar: si esta escritura falla, el emparejamiento
  // queda sin turno de pago y ni transfer-payment ni el pago por Mercado Pago
  // funcionan (así se descubrió que `payment_assignee` nunca se había creado
  // en la tabla — ver migración 062).
  const { data: claimed, error: claimErr } = await (admin as any)
    .from('class_2x_requests')
    .update({
      matched_with: user.id,
      status: 'matched',
      payment_assignee: req2x.user_id, // requester pays by default
    })
    .eq('id', request_id)
    .eq('status', 'looking')
    .select('id')
    .maybeSingle()

  if (claimErr) {
    logger.error('twox_match_update_failed', claimErr, { request_id, class_id: req2x.class_id })
    return NextResponse.json({ error: 'Failed to match' }, { status: 500 })
  }
  if (!claimed) {
    return NextResponse.json({ error: 'Request not found or already matched' }, { status: 404 })
  }

  // Si las inscripciones no se pueden crear, la solicitud vuelve a la búsqueda:
  // dejarla 'matched' sin inscripciones la mataría para siempre (ninguna
  // pantalla la ofrece y ninguna ruta la vuelve a mirar).
  const releaseClaim = async () => {
    await (admin as any)
      .from('class_2x_requests')
      .update({ matched_with: null, status: 'looking', payment_assignee: null })
      .eq('id', request_id)
  }

  // Create enrollment for requester (A) - they pay by default
  const { data: enrollA, error: errA } = await admin
    .from('enrollments')
    .insert({
      student_id: req2x.user_id,
      class_id: req2x.class_id,
      session_id: null,
      status: 'pending_payment',
      is_2x: true,
    })
    .select()
    .single()

  if (errA || !enrollA) {
    logger.error('twox_match_enroll_failed', errA, { request_id, side: 'A' })
    await releaseClaim()
    return NextResponse.json({ error: 'Failed to create enrollment A' }, { status: 500 })
  }

  // Create enrollment for matcher (B)
  const { data: enrollB, error: errB } = await admin
    .from('enrollments')
    .insert({
      student_id: user.id,
      class_id: req2x.class_id,
      session_id: null,
      status: 'pending_payment',
      is_2x: true,
      partner_enrollment_id: enrollA.id,
    })
    .select()
    .single()

  if (errB || !enrollB) {
    logger.error('twox_match_enroll_failed', errB, { request_id, side: 'B' })
    await admin.from('enrollments').delete().eq('id', enrollA.id)
    await releaseClaim()
    return NextResponse.json({ error: 'Failed to create enrollment B' }, { status: 500 })
  }

  // Link A's enrollment to B
  await admin.from('enrollments').update({ partner_enrollment_id: enrollB.id }).eq('id', enrollA.id)

  // Notify requester (A) that B matched
  await notifyUsers(admin, [{
    user_id: req2x.user_id,
    type: '2x_match',
    data: {
      class_id: req2x.class_id,
      class_title: cls.title ?? '',
      matched_with: user.id,
      enrollment_id: enrollA.id,
    },
  }])

  return NextResponse.json({ success: true, enrollment_id: enrollA.id })
}
