import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { cancelBillableSubscriptions } from '@/lib/subscriptionCancel'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  let userId: string
  let accessToken: string | null = null
  let supabaseForSignOut: any

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const anonClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    accessToken = token
    supabaseForSignOut = anonClient
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    const { data: { session } } = await supabase.auth.getSession()
    accessToken = session?.access_token ?? null
    supabaseForSignOut = supabase
  }

  // Rate limit: destructive operation — max 5 per minute (prevents accidental loops)
  const deleteLimit = await checkRateLimit(`account:delete:${userId}`, 'destructive')
  if (deleteLimit) return deleteLimit

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const tombstoneEmail = `deleted-${userId}@deleted.danzclass.internal`

  // Anonymize profile data and mark as deleted
  await admin.from('profiles').update({
    full_name: 'Usuario eliminado',
    username: `deleted_${Date.now()}`,
    bio: null,
    avatar_url: null,
    instagram_handle: null,
    city: null,
    styles_dancing: [],
    styles_teaching: [],
    deleted_at: now,
  } as any).eq('id', userId)

  // Cancelar de verdad: en Mercado Pago y en la base, incluyendo 'grace'.
  // Antes era soft-cancel sin llamar nunca a MP, así que al usuario que se iba
  // le seguían cobrando sin ninguna forma de detenerlo (audit3 P1-3).
  const cancelled = await cancelBillableSubscriptions(admin, userId, 'account_delete_subscription_cancel')
  if (cancelled.mpFailed.length > 0) {
    // Cobro que sigue corriendo sobre una cuenta borrada: hay que verlo.
    logger.error(
      'account_delete_mp_cancel_failed',
      new Error('preapproval cancel failed'),
      { user_id: userId, mp_subscription_ids: cancelled.mpFailed }
    )
  }

  // El teléfono no puede seguir recibiendo notificaciones de una cuenta borrada.
  await admin.from('push_tokens' as any).delete().eq('user_id', userId)

  // Tombstone the auth email so the user cannot sign back in
  await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail,
    email_confirm: true,
  })

  // Terminar la sesión de VERDAD. `supabaseForSignOut.auth.signOut()` no
  // alcanzaba: en el camino de mobile el cliente se construye con el Bearer en
  // un header y no tiene ninguna sesión guardada que cerrar, así que la llamada
  // no hacía nada y el refresh token del dispositivo seguía renovando la sesión
  // indefinidamente (verificado en audit3 P1-3). El scope 'global' revoca todos
  // los refresh tokens del usuario.
  //
  // El access token que ya está emitido sigue siendo válido hasta que expire
  // (es un JWT, PostgREST sólo verifica firma y vencimiento): la sesión muere
  // cuando ese token caduca, no antes.
  if (accessToken) {
    const { error: signOutError } = await admin.auth.admin.signOut(accessToken, 'global')
    if (signOutError) {
      logger.warn('account_delete_signout_failed', { user_id: userId, reason: signOutError.message })
    }
  }
  // Y limpiar las cookies del navegador en el camino web.
  await supabaseForSignOut.auth.signOut().catch(() => {})

  return NextResponse.json({ ok: true })
}
