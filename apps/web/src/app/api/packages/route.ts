import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { canTeach } from '@danceclass/shared'
import { getActiveTier } from '@/lib/subscription'
import { createClient } from '@/lib/supabase/server'

// POST /api/packages — teacher creates a package
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = createClient()
  const tier = await getActiveTier(auth.user.id, supabase)
  if (!canTeach(tier)) {
    return NextResponse.json({ error: 'requires_teacher_plan' }, { status: 403 })
  }

  const body = await request.json()
  const { title, description, price, class_ids } = body as {
    title: string
    description?: string
    price: number
    class_ids: string[]
  }

  if (!title?.trim() || !price || price <= 0 || !class_ids?.length || class_ids.length < 2) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify all classes belong to this teacher
  const { data: ownedClasses } = await (admin as any)
    .from('classes')
    .select('id')
    .in('id', class_ids)
    .eq('teacher_id', auth.user.id)
    .in('status', ['active'])

  if (!ownedClasses || ownedClasses.length !== class_ids.length) {
    return NextResponse.json({ error: 'invalid_classes' }, { status: 400 })
  }

  // Create package
  const { data: pkg, error: pkgErr } = await (admin as any)
    .from('class_packages')
    .insert({ teacher_id: auth.user.id, title: title.trim(), description: description?.trim() ?? null, price })
    .select()
    .single()

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  // Create package items
  const items = class_ids.map((class_id: string) => ({ package_id: pkg.id, class_id }))
  await (admin as any).from('class_package_items').insert(items)

  return NextResponse.json({ package: pkg })
}
