import { NextResponse } from 'next/server'
import { logger } from './logger'

// Upstash Redis + Ratelimit — only active when env vars are configured.
// If not configured, all requests pass through with a warning log.
let Ratelimit: any
let Redis: any

try {
  Ratelimit = require('@upstash/ratelimit').Ratelimit
  Redis = require('@upstash/redis').Redis
} catch {
  // packages available but import failed — handled below
}

function makeRatelimiter(tokens: number, windowStr: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  if (!Ratelimit || !Redis || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, windowStr) })
  } catch {
    return null
  }
}

// Separate limiters per sensitivity level
const limiters = {
  // Social actions: follow, friend_request, friend_accepted — 60/min per user
  social: makeRatelimiter(60, '1 m'),
  // Enrollment: max 10 enroll attempts per minute per user
  enroll: makeRatelimiter(10, '1 m'),
  // Notifications general: 30/min per user
  notif: makeRatelimiter(30, '1 m'),
  // Discount (per class): 3 per 30 minutes per user
  discount: makeRatelimiter(3, '30 m'),
  // Destructive ops (delete account, admin actions): 5/min per user
  destructive: makeRatelimiter(5, '1 m'),
  // Geocoding proxy (address autocomplete): 30/min per user — protects the
  // upstream Nominatim instance from our own clients.
  geocode: makeRatelimiter(30, '1 m'),
  // Payment receipt scanning (calls the Anthropic API, has real per-call cost): 10/min per user.
  scan: makeRatelimiter(10, '1 m'),
  // Reenvío de correo de confirmación: 3/hora por email — protege el SMTP de abuso.
  emailResend: makeRatelimiter(3, '1 h'),
  // Reserva de cupo con lock temporal (item 3): 10/día por (usuario, clase) para
  // impedir que alguien mantenga un cupo bloqueado indefinidamente re-reservando.
  reserve: makeRatelimiter(10, '1 d'),
}

type LimiterKey = keyof typeof limiters

// P1-4: en dev/test, degradar en silencio (console.warn) está bien — no hay
// Upstash local. En producción, la misma ausencia deja TODAS las rutas sin
// límite (el checkRateLimit "fail-open" de más abajo es intencional para no
// bloquear tráfico legítimo si Redis falla en caliente, pero una
// configuración faltante desde el arranque es un error de despliegue, no un
// blip transitorio). Se loguea una sola vez por proceso vía `logger.error`
// (nivel que Vercel/Sentry indexan como error) para que sea imposible no
// notarlo, sin generar una tormenta de logs por cada request sin límite.
let warnedMissingUpstashInProd = false

/**
 * Check rate limit. Returns a 429 NextResponse if exceeded, null if ok.
 * Key should be `${userId}:${optional_resource_id}` for per-resource limits.
 */
export async function checkRateLimit(
  key: string,
  type: LimiterKey = 'notif'
): Promise<NextResponse | null> {
  const limiter = limiters[type]
  if (!limiter) {
    // Upstash not configured — degrade gracefully (never block legitimate traffic)
    if (process.env.NODE_ENV === 'production') {
      if (!warnedMissingUpstashInProd) {
        warnedMissingUpstashInProd = true
        logger.error('rate_limit_upstash_not_configured', 'UPSTASH_REDIS_REST_URL/TOKEN missing in production', { type })
      }
    } else if (process.env.NODE_ENV !== 'test') {
      console.warn('[rateLimit] Upstash not configured — skipping rate limit check')
    }
    return null
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(key)
    if (!success) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          },
        }
      )
    }
  } catch {
    // Redis error — fail open to avoid blocking legitimate traffic
  }

  return null
}
