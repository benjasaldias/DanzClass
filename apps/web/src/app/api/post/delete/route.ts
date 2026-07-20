import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteCloudinaryAssets } from '@/lib/cloudinary-admin'
import { checkRateLimit } from '@/lib/rateLimit'

// Borra una publicación (video) + su asset en Cloudinary (item 10). Antes el
// cliente hacía `posts.delete()` directo y el video quedaba huérfano en
// Cloudinary (borrar requiere el API secret, solo en servidor). Solo el autor
// puede borrar por acá; el panel superadmin borra por su propia ruta.

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const limitHit = await checkRateLimit(`post-delete:${userId}`, 'destructive')
  if (limitHit) return limitHit

  const body = await request.json().catch(() => ({}))
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  if (!postId) return NextResponse.json({ error: 'postId requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: post } = await (admin as any)
    .from('posts')
    .select('id, user_id, video_url, thumbnail_url')
    .eq('id', postId)
    .maybeSingle()

  if (!post) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })
  if (post.user_id !== userId) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Borra el video + thumbnail en Cloudinary (ignora URLs que no sean de Cloudinary).
  await deleteCloudinaryAssets([post.video_url, post.thumbnail_url])

  const { error } = await (admin as any).from('posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
