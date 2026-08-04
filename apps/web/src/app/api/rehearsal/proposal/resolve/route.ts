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

/**
 * Las dos salidas manuales que el creador tiene sobre una votación abierta:
 *
 *   fix_now → fijar el horario aunque no se haya alcanzado el umbral. Sin esto,
 *             una votación que se queda en 3 de 4 no se resuelve nunca y el
 *             ensayo no llega a tener fecha.
 *   cancel  → cerrarla para proponer otro horario (sólo hay una abierta a la vez).
 */
const Schema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(['fix_now', 'cancel']),
})

export async function POST(req: Request) {
  const authed = await requireUser(req)
  if ('error' in authed) return authed.error
  const user = authed.user

  const rl = await checkRateLimit(`rehearsal-resolve:${user.id}`, 'social')
  if (rl) return rl

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const { proposal_id, action } = parsed.data

  const admin = createAdminClient()

  const { data: proposal } = await (admin as any)
    .from('rehearsal_proposals')
    .select('*')
    .eq('id', proposal_id)
    .single()

  if (!proposal) return NextResponse.json({ error: 'Votación no encontrada' }, { status: 404 })

  const ctx = await loadCoordinationContext(admin, proposal.rehearsal_id, user.id)
  if (!ctx) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 })
  if (!ctx.isCreator) {
    return NextResponse.json({ error: 'Sólo quien organiza puede cerrar la votación', code: 'not_creator' }, { status: 403 })
  }
  if (proposal.status !== 'open') {
    return NextResponse.json({ error: 'Esta votación ya está cerrada', code: 'proposal_closed' }, { status: 409 })
  }

  if (action === 'cancel') {
    await (admin as any)
      .from('rehearsal_proposals')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', proposal_id)
      .eq('status', 'open')
    // Sin notificación: nadie se comprometió a nada todavía y avisar "se canceló
    // la votación" a quienes no habían visto la primera notificación es ruido.
    // La UI del ensayo muestra el estado.
    return NextResponse.json({ ok: true, cancelled: true })
  }

  const blocker = coordinationBlocker(ctx.rehearsal)
  if (blocker) {
    return NextResponse.json({ error: 'Este ensayo ya no admite votación', code: blocker }, { status: 409 })
  }

  const { data: votes } = await (admin as any)
    .from('rehearsal_proposal_votes')
    .select('user_id, vote')
    .eq('proposal_id', proposal_id)

  const tally = tallyFor(ctx, proposal, (votes as any[]) ?? [])

  const result = await confirmProposal(admin, ctx, proposal, { forcedBy: user.id })
  if (!result.ok) {
    if (result.error === 'already_resolved') {
      return NextResponse.json({ ok: true, confirmed: true, tally })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, confirmed: true, tally, fixed: result.outcome })
}
