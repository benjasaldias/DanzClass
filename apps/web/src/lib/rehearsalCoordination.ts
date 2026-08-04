import { createAdminClient } from './supabase/admin'
import { notifyUsers } from './notifyUsers'
import {
  tallyProposal,
  rangeDurationMinutes,
  formatRange,
  type ProposalVote,
} from '@danceclass/shared'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Lo que las rutas de votación necesitan saber antes de escribir nada. Un solo
 * lugar para "¿quién es parte de este ensayo?" — la pregunta que las tres rutas
 * repiten y que si divergen abre exactamente el tipo de agujero que audit3
 * encontró en las rutas hermanas de pago.
 */
export type CoordinationContext = {
  rehearsal: any
  /** Todos los que cuentan como integrantes: creador + invitados no rechazados. */
  memberIds: string[]
  isCreator: boolean
  isParticipant: boolean
}

export async function loadCoordinationContext(
  admin: AdminClient,
  rehearsalId: string,
  userId: string,
): Promise<CoordinationContext | null> {
  const { data: rehearsal } = await (admin as any)
    .from('rehearsals')
    .select('id, title, creator_id, status, date_mode, coordinate_month, rehearsal_date, duration_minutes')
    .eq('id', rehearsalId)
    .single()

  if (!rehearsal) return null

  const { data: invites } = await (admin as any)
    .from('rehearsal_invites')
    .select('user_id, status')
    .eq('rehearsal_id', rehearsalId)

  const rows = (invites as any[]) ?? []
  const memberIds = [...new Set([
    rehearsal.creator_id,
    ...rows.filter((i) => i.status !== 'rejected').map((i) => i.user_id),
  ])] as string[]

  const isCreator = rehearsal.creator_id === userId
  return {
    rehearsal,
    memberIds,
    isCreator,
    // Quien rechazó la invitación no participa de la coordinación. Coincide con
    // `is_rehearsal_participant()` en SQL, que es lo que hace cumplir las
    // policies de las tablas nuevas.
    isParticipant: isCreator || memberIds.includes(userId),
  }
}

/**
 * Por qué un ensayo NO admite coordinación. `null` = sí admite.
 * Devuelve el código de error que la ruta usa tal cual, para que web y mobile
 * puedan ramificar sin parsear texto.
 */
export function coordinationBlocker(rehearsal: any): string | null {
  if (rehearsal.status !== 'active') return 'rehearsal_inactive'
  if (rehearsal.date_mode !== 'coordinate') return 'not_coordinated'
  // Ya tiene fecha: la votación cumplió su propósito. Cambiarla es "Editar
  // ensayo", no una votación nueva — si no, un integrante que ya bloqueó su
  // agenda se enteraría de que la fecha se movió por una notificación.
  if (rehearsal.rehearsal_date) return 'already_settled'
  return null
}

export type ConfirmOutcome = {
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
}

/**
 * Fija la fecha del ensayo a partir de una propuesta y avisa a TODO el grupo,
 * hayan votado o no (el punto del diseño: quien no votó igual necesita saber
 * cuándo es).
 *
 * Idempotente por el `.eq('status', 'open')` del UPDATE: si dos votos llegan a
 * la vez y los dos alcanzan el umbral, sólo uno mueve la propuesta a
 * 'confirmed' y el otro ve 0 filas y no vuelve a notificar. Es el mismo
 * compare-and-set del match 2x.
 */
export async function confirmProposal(
  admin: AdminClient,
  ctx: CoordinationContext,
  proposal: any,
  opts: { forcedBy?: string | null } = {},
): Promise<{ ok: true; outcome: ConfirmOutcome } | { ok: false; error: string }> {
  const duration = rangeDurationMinutes({ start_time: proposal.start_time, end_time: proposal.end_time })
  if (duration <= 0) return { ok: false, error: 'invalid_range' }

  const { data: claimed } = await (admin as any)
    .from('rehearsal_proposals')
    .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
    .eq('id', proposal.id)
    .eq('status', 'open')
    .select('id')

  if (!claimed || (claimed as any[]).length === 0) {
    // Otro voto simultáneo ya la cerró. No es un error: el resultado que el
    // llamador quería ya ocurrió.
    return { ok: false, error: 'already_resolved' }
  }

  const { error: upErr } = await (admin as any)
    .from('rehearsals')
    .update({
      rehearsal_date: proposal.proposed_date,
      rehearsal_time: proposal.start_time,
      duration_minutes: duration,
      confirmed_at: new Date().toISOString(),
      // date_mode se queda en 'coordinate' a propósito: que la fecha salió de
      // una coordinación es información que la UI muestra ("Fijado por
      // votación"), y `expires_at` ya no depende del modo cuando hay fecha.
    })
    .eq('id', ctx.rehearsal.id)

  if (upErr) return { ok: false, error: upErr.message }

  const rangeLabel = formatRange({ start_time: proposal.start_time, end_time: proposal.end_time })
  await notifyUsers(admin, ctx.memberIds.map((uid) => ({
    user_id: uid,
    type: 'rehearsal_date_set' as const,
    data: {
      rehearsal_id: ctx.rehearsal.id,
      rehearsal_title: ctx.rehearsal.title,
      rehearsal_date: proposal.proposed_date,
      start_time: proposal.start_time,
      end_time: proposal.end_time,
      range_label: rangeLabel,
      forced: !!opts.forcedBy,
    },
  })))

  return {
    ok: true,
    outcome: {
      date: proposal.proposed_date,
      start_time: proposal.start_time,
      end_time: proposal.end_time,
      duration_minutes: duration,
    },
  }
}

/** Conteo de una propuesta contra sus votos ya cargados. */
export function tallyFor(ctx: CoordinationContext, proposal: any, votes: ProposalVote[]) {
  return tallyProposal(
    votes,
    proposal.required_confirmations,
    ctx.memberIds.length,
    ctx.rehearsal.creator_id,
  )
}
