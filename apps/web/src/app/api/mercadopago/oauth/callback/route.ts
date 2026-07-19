import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { verifyState, exchangeCodeForToken, getAppUrl } from '@/lib/mercadopago/oauth'

// GET /api/mercadopago/oauth/callback?code=...&state=...
// Mercado Pago redirige aquí tras autorizar. Intercambiamos el code por tokens
// y los guardamos en teacher_mp_connections (service role).
export async function GET(request: Request) {
  const url = new URL(request.url)
  const settings = `${getAppUrl()}/profile/payment-info`

  // El usuario canceló o MP devolvió error.
  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    return NextResponse.redirect(`${settings}?mp=cancelled`)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return NextResponse.redirect(`${settings}?mp=error`)
  }

  const userId = verifyState(state)
  if (!userId) {
    logger.warn('mp_oauth_bad_state')
    return NextResponse.redirect(`${settings}?mp=error`)
  }

  // Defensa en profundidad: si hay sesión en cookie, debe coincidir con el state.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && user.id !== userId) {
    logger.warn('mp_oauth_state_user_mismatch', { state_user: userId, session_user: user.id })
    return NextResponse.redirect(`${settings}?mp=error`)
  }

  let tokens
  try {
    tokens = await exchangeCodeForToken(code)
  } catch (err) {
    logger.error('mp_oauth_exchange_failed', err)
    return NextResponse.redirect(`${settings}?mp=error`)
  }

  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 0) * 1000).toISOString()

  const { error: upsertErr } = await (admin as any)
    .from('teacher_mp_connections')
    .upsert({
      teacher_id: userId,
      mp_user_id: String(tokens.user_id),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      public_key: tokens.public_key ?? null,
      scope: tokens.scope ?? null,
      live_mode: !!tokens.live_mode,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'teacher_id' })

  if (upsertErr) {
    // 23505 en mp_user_id → esa cuenta MP ya está vinculada a otro profesor.
    if ((upsertErr as any).code === '23505') {
      return NextResponse.redirect(`${settings}?mp=account_in_use`)
    }
    logger.error('mp_oauth_store_failed', upsertErr)
    return NextResponse.redirect(`${settings}?mp=error`)
  }

  await (admin as any).from('profiles').update({ mp_connected: true }).eq('id', userId)

  logger.info('mp_oauth_connected', { teacher_id: userId, mp_user_id: String(tokens.user_id), live_mode: !!tokens.live_mode })
  return NextResponse.redirect(`${settings}?mp=connected`)
}
