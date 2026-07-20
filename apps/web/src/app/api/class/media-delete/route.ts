import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteCloudinaryAssets } from '@/lib/cloudinary-admin'

// Borra un item de class_media (al quitarlo en el editor de clase) incluyendo su
// asset físico: video en Cloudinary o imagen en el bucket Supabase (item 10).
// Solo el profesor dueño de la clase puede borrar.

export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const body = await request.json().catch(() => ({}))
  const mediaId = typeof body?.mediaId === 'string' ? body.mediaId : ''
  if (!mediaId) return NextResponse.json({ error: 'mediaId requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: media } = await (admin as any)
    .from('class_media')
    .select('id, url, class:classes!inner(teacher_id)')
    .eq('id', mediaId)
    .maybeSingle()

  if (!media) return NextResponse.json({ error: 'Media no encontrada' }, { status: 404 })
  if (media.class?.teacher_id !== userId) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url: string = media.url ?? ''
  // Video en Cloudinary (ignora si no lo es) + imagen en bucket Supabase.
  await deleteCloudinaryAssets([url])
  const path = url.split('/class-media/')[1]
  if (path) await admin.storage.from('class-media').remove([path])

  await (admin as any).from('class_media').delete().eq('id', mediaId)

  return NextResponse.json({ ok: true })
}
