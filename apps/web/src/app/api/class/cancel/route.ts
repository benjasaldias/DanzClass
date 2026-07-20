import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteCloudinaryAssets } from '@/lib/cloudinary-admin'

// Cancels (soft-deletes) a class and cleans up associated chats + media.
// La limpieza de media se hace acá server-side (item 10): los VIDEOS de clase
// viven en Cloudinary y solo se pueden borrar con el API secret (servidor). Las
// imágenes viven en el bucket Supabase class-media. El cron sirve de red de
// seguridad para lo que quede.
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id } = await req.json().catch(() => ({}))
  if (!class_id) return NextResponse.json({ error: 'class_id requerido' }, { status: 400 })

  const admin = createAdminClient()

  // Verify ownership
  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id, status')
    .eq('id', class_id)
    .eq('teacher_id', user.id)
    .maybeSingle()

  if (!cls) return NextResponse.json({ error: 'Clase no encontrada o sin permisos' }, { status: 404 })
  if ((cls as any).status === 'cancelled') return NextResponse.json({ ok: true })

  // Soft-delete
  await admin.from('classes').update({ status: 'cancelled' } as any).eq('id', class_id)

  // Media cleanup: Cloudinary (videos) + bucket Supabase (imágenes) + filas.
  const { data: media } = await (admin as any)
    .from('class_media')
    .select('url')
    .eq('class_id', class_id)

  const urls: string[] = (media ?? []).map((m: any) => m.url).filter(Boolean)
  if (urls.length > 0) {
    await deleteCloudinaryAssets(urls)
    const storagePaths = urls
      .map((url) => url.split('/class-media/')[1] ?? '')
      .filter(Boolean)
    if (storagePaths.length > 0) {
      await admin.storage.from('class-media').remove(storagePaths)
    }
    await (admin as any).from('class_media').delete().eq('class_id', class_id)
  }

  // Delete associated chats (cascade removes participants and messages via FK)
  await (admin as any).from('chats').delete().eq('class_id', class_id)

  return NextResponse.json({ ok: true })
}
