import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'
import { loadCoordinationContext, coordinationBlocker } from '@/lib/rehearsalCoordination'
import { formatRange, rangeDurationMinutes, timeToMinutes } from '@danceclass/shared'

/**
 * El creador abre una votación de horario.
 *
 * Escribe con service role a propósito (077 no le dio policies de escritura a
 * `rehearsal_proposals`): "cuántas confirmaciones hacen falta" es una regla que
 * RLS no puede validar y que, escrita desde el cliente, el propio cliente puede
 * falsear después.
 */
const Schema = z.object({
  rehearsal_id: z.string().uuid(),
  proposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  // Minutos libres: 12:30–13:35 es un horario válido de ensayo.
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora de inicio inválida'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora de término inválida'),
  required_confirmations: z.number().int().min(1).max(200),
})

export async function POST(req: Request) {
  const authed = await requireUser(req)
  if ('error' in authed) return authed.error
  const user = authed.user

  const rl = await checkRateLimit(`rehearsal-proposal:${user.id}`, 'social')
  if (rl) return rl

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { rehearsal_id, proposed_date, start_time, end_time, required_confirmations } = parsed.data

  const startMin = timeToMinutes(start_time)
  const endMin = timeToMinutes(end_time)
  if (startMin === null || endMin === null || endMin <= startMin) {
    return NextResponse.json({ error: 'El término debe ser posterior al inicio', code: 'invalid_range' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ctx = await loadCoordinationContext(admin, rehearsal_id, user.id)
  if (!ctx) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 })
  if (!ctx.isCreator) {
    return NextResponse.json({ error: 'Sólo quien organiza puede iniciar una votación', code: 'not_creator' }, { status: 403 })
  }

  const blocker = coordinationBlocker(ctx.rehearsal)
  if (blocker) {
    const messages: Record<string, string> = {
      rehearsal_inactive: 'Este ensayo ya no está activo',
      not_coordinated: 'Este ensayo no es de fecha por coordinar',
      already_settled: 'La fecha de este ensayo ya está fijada',
    }
    return NextResponse.json({ error: messages[blocker] ?? 'No se puede coordinar', code: blocker }, { status: 409 })
  }

  // La fecha propuesta tiene que caer dentro del mes acordado: el mes es el
  // plazo que el grupo aceptó y es lo que define cuándo caduca el ensayo. Una
  // propuesta fuera de él quedaría fijada para después de que el post desaparece.
  if (ctx.rehearsal.coordinate_month && !proposed_date.startsWith(ctx.rehearsal.coordinate_month)) {
    return NextResponse.json(
      { error: 'La fecha debe estar dentro del mes a coordinar', code: 'out_of_month' },
      { status: 400 },
    )
  }

  if (required_confirmations > ctx.memberIds.length) {
    return NextResponse.json(
      {
        error: `Sólo hay ${ctx.memberIds.length} integrante(s); no se pueden pedir ${required_confirmations} confirmaciones`,
        code: 'threshold_too_high',
      },
      { status: 400 },
    )
  }

  const { data: proposal, error } = await (admin as any)
    .from('rehearsal_proposals')
    .insert({
      rehearsal_id,
      created_by: user.id,
      proposed_date,
      start_time,
      end_time,
      required_confirmations,
    })
    .select()
    .single()

  if (error) {
    // 23505 contra `rehearsal_proposals_one_open`: ya hay una abierta. Una sola
    // a la vez es intencional — dos que alcancen el umbral no tienen desempate.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya hay una votación abierta. Ciérrala antes de abrir otra.', code: 'proposal_already_open' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // El creador ya dijo que puede (propuso el horario), así que no se lo avisa a
  // sí mismo ni se le pide votar.
  const recipients = ctx.memberIds.filter((id) => id !== user.id)
  if (recipients.length > 0) {
    const { data: creatorProfile } = await admin
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single()

    await notifyUsers(admin, recipients.map((uid) => ({
      user_id: uid,
      type: 'rehearsal_vote' as const,
      data: {
        rehearsal_id,
        rehearsal_title: ctx.rehearsal.title,
        proposal_id: proposal.id,
        proposed_date,
        start_time,
        end_time,
        range_label: formatRange({ start_time, end_time }),
        duration_minutes: rangeDurationMinutes({ start_time, end_time }),
        from_user_id: user.id,
        from_username: creatorProfile?.username ?? '',
        from_full_name: creatorProfile?.full_name ?? '',
      },
    })))
  }

  return NextResponse.json({ ok: true, proposal })
}
