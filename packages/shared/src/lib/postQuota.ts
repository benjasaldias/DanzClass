import type { SubscriptionTier } from '../types/index'

/**
 * Cupo de videos EXPUESTOS (visibles para otros) según el plan vigente.
 * Espejo exacto de post_quota_for_tier() en 060_post_plan_visibility.sql — la
 * base de datos es la autoridad; esto es solo para la UI.
 *
 * Los videos que exceden el cupo no se borran: quedan ocultos (solo los ve su
 * autor) y se purgan tras PLAN_HIDDEN_RETENTION_DAYS.
 */
export const UNLIMITED_POSTS = Number.POSITIVE_INFINITY

export function postQuotaForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case 'basic':
      return 3
    case 'teacher':
    case 'pro':
      return UNLIMITED_POSTS
    default:
      return 0
  }
}

/** Días que sobrevive un video oculto por falta de plan antes de borrarse. */
export const PLAN_HIDDEN_RETENTION_DAYS = 90

/** Días restantes antes de la purga. Negativo o 0 = ya vencido. */
export function daysUntilPurge(planHiddenAt: string | null | undefined): number | null {
  if (!planHiddenAt) return null
  const hidden = new Date(planHiddenAt).getTime()
  if (isNaN(hidden)) return null
  const purgeAt = hidden + PLAN_HIDDEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000))
}
