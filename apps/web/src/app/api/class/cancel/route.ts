import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Cancels (soft-deletes) a class and cleans up associated chats.
// The Storage media cleanup is done by the caller (ClassDetailClient) for immediate UX feedback;
// the cron serves as a fallback.
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

  // Delete associated chats (cascade removes participants and messages via FK)
  await (admin as any).from('chats').delete().eq('class_id', class_id)

  return NextResponse.json({ ok: true })
}
