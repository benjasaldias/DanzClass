import type { SubscriptionTier, ClassType } from '../types/index'

/**
 * Cupo de publicación de clases según el plan vigente (audit3 P1-1).
 *
 * Espejo exacto de class_quota_for_tier() en 075_class_plan_quota.sql — la base
 * de datos es la autoridad: `classes` se inserta DIRECTO desde el cliente (web y
 * mobile), así que cualquier chequeo acá es sólo para que la UI muestre el
 * candado antes de que el usuario llene el formulario. Es el mismo reparto que
 * `060` hizo con el cupo de videos.
 *
 * El cupo de sueltas es POR MES CALENDARIO y cuenta las clases CREADAS en el mes,
 * incluidas las canceladas después: si borrar liberara el cupo, el tope no
 * existiría (publicar → cancelar → publicar, sin fin).
 */
export const UNLIMITED_CLASSES = Number.POSITIVE_INFINITY

/** Sueltas que un tier puede publicar por mes calendario. 0 = no puede publicar. */
export function monthlyClassQuotaForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case 'basic':
      return 1
    case 'teacher':
    case 'pro':
      return UNLIMITED_CLASSES
    default:
      return 0
  }
}

/** Periódicas y entrenamientos son del plan Pro; el Básico sólo publica sueltas. */
export function canPublishClassType(tier: SubscriptionTier, type: ClassType): boolean {
  if (monthlyClassQuotaForTier(tier) === 0) return false
  return type === 'suelta' || monthlyClassQuotaForTier(tier) === UNLIMITED_CLASSES
}

/**
 * Traducción de los rechazos del trigger `classes_plan_quota_guard`. El INSERT
 * sale del cliente, así que el mensaje del error es lo único que llega: sin esto
 * el usuario ve "Error al crear la clase" cuando el problema es su plan.
 */
export function classQuotaErrorMessage(dbMessage: string | null | undefined): string | null {
  const msg = dbMessage ?? ''
  if (msg.includes('class_quota_exceeded')) {
    return 'El plan Básico permite publicar 1 clase suelta por mes. Actualiza a Pro para publicar sin límite.'
  }
  if (msg.includes('class_type_requires_pro')) {
    return 'Las clases periódicas y los entrenamientos son del plan Pro.'
  }
  if (msg.includes('plan_required_for_classes')) {
    return 'Publicar clases requiere un plan activo.'
  }
  return null
}
