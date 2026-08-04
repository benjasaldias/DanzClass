import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifyUsers'
import { checkRateLimit } from '@/lib/rateLimit'

/**
 * "¡Enséñala!" — pedirle al autor de un video que dicte esa coreografía.
 *
 * A diferencia del "me gusta" (que el cliente escribe directo, ver
 * 076_post_interactions.sql), esto pasa por una ruta porque hay tres reglas que
 * la RLS no puede expresar y una que no debe repetirse:
 *
 *   1. El autor tiene que haber HABILITADO los pedidos (`allow_teach_requests`).
 *      Nace apagado: un cover no es coreografía propia y su autor no la va a
 *      enseñar.
 *   2. El autor no se pide a sí mismo.
 *   3. El video tiene que ser visible para quien pide — la policy de lectura de
 *      `posts` (060) gobierna eso y acá se repite a mano porque el service role
 *      se la salta.
 *   4. El aviso al autor sale UNA sola vez por persona: el botón es un
 *      interruptor (se puede sacar el pedido y volver a ponerlo) y sin la
 *      deduplicación sería una campana infinita.
 *
 * Acepta Bearer (mobile) y cookie (web) vía `requireUser`.
 */

type Body = { postId?: unknown; action?: unknown }

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const limitHit = await checkRateLimit(`teach-request:${userId}`, 'social')
  if (limitHit) return limitHit

  const body = (await request.json().catch(() => ({}))) as Body
  const postId = typeof body.postId === 'string' ? body.postId : ''
  const action = body.action === 'remove' ? 'remove' : 'add'
  if (!postId) return NextResponse.json({ error: 'postId requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: post } = await (admin as any)
    .from('posts')
    .select('id, user_id, title, visibility, allow_teach_requests, plan_hidden_at')
    .eq('id', postId)
    .maybeSingle()

  if (!post) return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
  if (post.user_id === userId) {
    return NextResponse.json({ error: 'own_post' }, { status: 403 })
  }
  if (!post.allow_teach_requests) {
    return NextResponse.json({ error: 'teach_requests_disabled' }, { status: 403 })
  }
  if (post.plan_hidden_at) {
    return NextResponse.json({ error: 'post_unavailable' }, { status: 403 })
  }
  if (!(await canSeePost(admin, post, userId))) {
    return NextResponse.json({ error: 'post_not_visible' }, { status: 403 })
  }

  if (action === 'remove') {
    const { error } = await (admin as any)
      .from('post_teach_requests')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, requested: false, count: await currentCount(admin, postId) })
  }

  // Idempotente: volver a pedir lo mismo no es un error ni duplica la fila.
  const { error } = await (admin as any)
    .from('post_teach_requests')
    .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 })

  await notifyAuthorOnce(admin, { postId, postTitle: post.title, authorId: post.user_id, requesterId: userId })

  return NextResponse.json({ ok: true, requested: true, count: await currentCount(admin, postId) })
}

async function currentCount(admin: any, postId: string): Promise<number> {
  const { data } = await admin.from('posts').select('teach_requests_count').eq('id', postId).maybeSingle()
  return Number(data?.teach_requests_count ?? 0)
}

/** Espejo de la policy `posts_select` de 060, para el cliente con service role. */
async function canSeePost(
  admin: any,
  post: { user_id: string; visibility: string | null },
  viewerId: string
): Promise<boolean> {
  if (post.user_id === viewerId) return true
  if (post.visibility === 'public' || !post.visibility) return true

  if (post.visibility === 'followers') {
    const { data } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', post.user_id)
      .eq('follower_id', viewerId)
      .maybeSingle()
    return !!data
  }

  if (post.visibility === 'friends') {
    const { data } = await admin
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${viewerId},addressee_id.eq.${post.user_id}),` +
        `and(requester_id.eq.${post.user_id},addressee_id.eq.${viewerId})`
      )
      .maybeSingle()
    return !!data
  }

  return false
}

/**
 * Un aviso por persona y por video. El pedido se puede sacar y volver a poner:
 * sin este chequeo, cada vaivén sería una notificación (y un push) más.
 */
async function notifyAuthorOnce(
  admin: any,
  { postId, postTitle, authorId, requesterId }: { postId: string; postTitle: string | null; authorId: string; requesterId: string }
): Promise<void> {
  const { data: already } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', authorId)
    .eq('type', 'teach_request')
    .eq('data->>post_id', postId)
    .eq('data->>from_user_id', requesterId)
    .maybeSingle()
  if (already) return

  const { data: requester } = await admin
    .from('profiles')
    .select('username, full_name')
    .eq('id', requesterId)
    .maybeSingle()

  await notifyUsers(admin, [{
    user_id: authorId,
    type: 'teach_request',
    data: {
      post_id: postId,
      post_title: postTitle ?? '',
      from_user_id: requesterId,
      from_username: requester?.username ?? null,
      from_name: requester?.full_name ?? null,
    },
  }])
}
