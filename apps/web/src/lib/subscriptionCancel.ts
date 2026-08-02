import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { logger } from './logger'

/**
 * Estados que siguen COBRANDO y que siguen dando tier (`get_user_tier` y
 * `getActiveTier` honran los dos). Cancelar es cancelar estos.
 *
 * `'trialing'` no existe: no está en el CHECK de la tabla
 * (`active|grace|expired|cancelled`). `/api/account/delete` filtraba por él
 * —un no-op— y omitía `'grace'`, así que borrar la cuenta dejaba viva la
 * suscripción y el cobro (audit3 P1-3 / P2-8).
 */
export const BILLABLE_SUBSCRIPTION_STATUSES = ['active', 'grace'] as const

export type CancelSubscriptionsResult = {
  ok: boolean
  /** Suscripciones que pasaron a 'cancelled'. */
  cancelled: number
  /** IDs de preaprobación de MP que NO se pudieron cancelar: ahí sigue el cobro. */
  mpFailed: string[]
}

/**
 * Cancela en Mercado Pago y en la base todas las suscripciones que siguen
 * cobrando. Compartido por `/api/subscriptions/cancel` y por el borrado de
 * cuenta, que hasta audit3 P1-3 hacía un soft-cancel sin llamar nunca a MP: el
 * usuario se iba y le seguían cobrando $1.500 o $3.500 al mes, sin forma de
 * pararlo desde la app (no puede volver a entrar por el tombstone del correo).
 *
 * Recorre TODAS las suscripciones cobrables, no sólo la más reciente: si por una
 * carrera quedaran dos activas, dejar una viva es exactamente el problema que
 * esto viene a cerrar.
 */
export async function cancelBillableSubscriptions(
  admin: any,
  userId: string,
  event: string
): Promise<CancelSubscriptionsResult> {
  const { data: subs } = await admin
    .from('subscriptions')
    .select('id, mp_subscription_id')
    .eq('user_id', userId)
    .in('status', BILLABLE_SUBSCRIPTION_STATUSES as unknown as string[])

  const mpFailed: string[] = []

  for (const sub of (subs ?? []) as { id: string; mp_subscription_id: string | null }[]) {
    if (!sub.mp_subscription_id) continue
    try {
      const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
      await new PreApproval(mp).update({
        id: String(sub.mp_subscription_id),
        body: { status: 'cancelled' },
      })
      logger.info(`${event}_mp`, { mp_subscription_id: sub.mp_subscription_id })
    } catch (e) {
      // Un pago único (no preaprobación) falla acá de forma esperable; una
      // preaprobación real que falla significa cobro que sigue corriendo, y por
      // eso el llamador recibe la lista.
      mpFailed.push(String(sub.mp_subscription_id))
      logger.warn(`${event}_mp_skipped`, {
        mp_subscription_id: sub.mp_subscription_id,
        reason: (e as any)?.message ?? String(e),
      })
    }
  }

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .in('status', BILLABLE_SUBSCRIPTION_STATUSES as unknown as string[])

  if (error) {
    logger.error(`${event}_db_failed`, error, { user_id: userId })
    return { ok: false, cancelled: 0, mpFailed }
  }

  return { ok: true, cancelled: subs?.length ?? 0, mpFailed }
}
