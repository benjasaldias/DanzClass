// Resolución de tier consolidada en `packages/shared` (P1-2, audit S6): mobile
// resolvía el tier en 9 lugares con un `.eq('status','active').single()` crudo
// que ignoraba `expires_at`, dando acceso completo tras vencer el plan. Este
// archivo queda como re-export para no tocar los 15 importadores existentes.
export { getActiveTier, getActiveSubscription, getCancelledPendingExpiry } from '@danceclass/shared'
