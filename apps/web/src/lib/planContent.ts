import { logger } from '@/lib/logger'

/**
 * Recalcula qué videos del usuario quedan expuestos según su plan vigente
 * (RPC reconcile_user_posts, ver 060_post_plan_visibility.sql).
 *
 * Se llama al activar/renovar una suscripción para que los videos guardados en
 * privado vuelvan a verse de inmediato, sin esperar al cron diario
 * (/api/cron/plan-content), que es la red de seguridad para el caso contrario:
 * el plan que caduca sin que nadie haga nada.
 *
 * Best-effort: nunca debe hacer fallar el flujo de pago que la invoca.
 */
export async function reconcilePlanContent(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> },
  userId: string
): Promise<void> {
  try {
    const { error } = await admin.rpc('reconcile_user_posts', { p_user_id: userId })
    if (error) logger.warn('plan_content_reconcile_failed', { user_id: userId, reason: error.message })
  } catch (e) {
    logger.warn('plan_content_reconcile_failed', { user_id: userId, reason: (e as Error).message })
  }
}
