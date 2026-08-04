import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  loadCoordinationContext,
  coordinationBlocker,
  confirmProposal,
  tallyFor,
} from '@/lib/rehearsalCoordination'
import { isProposalStale } from '@danceclass/shared'

/**
 * Un integrante confirma (o descarta) el horario propuesto.
 *
 * El voto va por ruta y no directo a la tabla porque el conteo y sus
 * consecuencias no son cosa del cliente: al alcanzar el umbral hay que fijar la
 * fecha del ensayo y avisar a todo el grupo. Un cliente que escribiera su
 * propio voto podría además mentir sobre el resto del conteo.
 */
const Schema = z.object({
  proposal_id: z.string().uuid(),
  vote: z.enum(['yes', 'no']),
})

export async function POST(req: Request) {
  const authed = await requireUser(req)
  if ('error' in authed) return authed.error
  const user = authed.user

  const rl = await checkRateLimit(`rehearsal-vote:${user.id}`, 'social')
  if (rl) return rl

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { proposal_id, vote } = parsed.data

  const admin = createAdminClient()

  const { data: proposal } = await (admin as any)
    .from('rehearsal_proposals')
    .select('*')
    .eq('id', proposal_id)
    .single()

  if (!proposal) return NextResponse.json({ error: 'Votación no encontrada' }, { status: 404 })

  const ctx = await loadCoordinationContext(admin, proposal.rehearsal_id, user.id)
  if (!ctx) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 })
  if (!ctx.isParticipant) {
    return NextResponse.json({ error: 'No participas de este ensayo', code: 'not_participant' }, { status: 403 })
  }

  if (proposal.status !== 'open') {
    return NextResponse.json(
      { error: 'Esta votación ya está cerrada', code: 'proposal_closed' },
      { status: 409 },
    )
  }

  // Una votación cuya hora de término ya pasó no se puede cumplir. El cron la
  // cierra, pero puede llegar un voto antes de que corra: no dejar que fije una
  // fecha que ya ocurrió.
  if (isProposalStale(proposal)) {
    await (admin as any)
      .from('rehearsal_proposals')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', proposal.id)
      .eq('status', 'open')
    return NextResponse.json(
      { error: 'El horario propuesto ya pasó', code: 'proposal_expired' },
      { status: 409 },
    )
  }

  const blocker = coordinationBlocker(ctx.rehearsal)
  if (blocker) {
    return NextResponse.json({ error: 'Este ensayo ya no admite votación', code: blocker }, { status: 409 })
  }

  // Cambiar de opinión mientras está abierta es legítimo, así que upsert sobre
  // la PK (proposal_id, user_id) en vez de rechazar el segundo voto.
  const { error: voteErr } = await (admin as any)
    .from('rehearsal_proposal_votes')
    .upsert(
      { proposal_id, user_id: user.id, vote, updated_at: new Date().toISOString() },
      { onConflict: 'proposal_id,user_id' },
    )
  if (voteErr) return NextResponse.json({ error: voteErr.message }, { status: 500 })

  const { data: votes } = await (admin as any)
    .from('rehearsal_proposal_votes')
    .select('user_id, vote')
    .eq('proposal_id', proposal_id)

  const tally = tallyFor(ctx, proposal, (votes as any[]) ?? [])

  if (!tally.reached) {
    return NextResponse.json({ ok: true, tally, confirmed: false })
  }

  const result = await confirmProposal(admin, ctx, proposal)
  if (!result.ok) {
    // 'already_resolved' = otro voto simultáneo la cerró primero. Para quien
    // vota el resultado es el mismo: la fecha quedó fijada.
    if (result.error === 'already_resolved') {
      return NextResponse.json({ ok: true, tally, confirmed: true })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tally, confirmed: true, fixed: result.outcome })
}
