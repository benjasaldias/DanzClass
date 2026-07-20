import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

// Reenvía el correo de confirmación de registro (item 4).
//
// - Rate-limit por email (3/hora, limiter `emailResend`) para proteger el SMTP
//   de abuso, además del rate-limit propio de Supabase (auth.rate_limit).
// - Respuesta SIEMPRE genérica ({ ok: true }) salvo 429/400: no revelamos si el
//   email existe o ya está confirmado (evita enumeración de cuentas). Supabase
//   tampoco envía nada si el email no existe o ya está confirmado.

export const runtime = 'nodejs'

function appOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    request.nextUrl.origin
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  // Validación básica de email (sin depender de zod aquí).
  if (!rawEmail || rawEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const limitHit = await checkRateLimit(`resend:${rawEmail}`, 'emailResend')
  if (limitHit) return limitHit

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    logger.error('resend-confirmation', 'Supabase env not configured')
    return NextResponse.json({ ok: true })
  }

  try {
    const supabase = createSupabaseClient(url, anonKey)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: rawEmail,
      options: { emailRedirectTo: `${appOrigin(request)}/feed` },
    })
    // No propagamos el error real al cliente (evita enumeración). Solo lo logueamos.
    if (error) {
      logger.warn('resend-confirmation:supabase', { message: error.message })
    }
  } catch (err) {
    logger.error('resend-confirmation', err)
  }

  return NextResponse.json({ ok: true })
}
