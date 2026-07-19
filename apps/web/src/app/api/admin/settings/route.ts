import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  if (!process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 503 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { key, value } = body

  if (key !== 'auto_confirm_enabled' || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error } = await (admin as any)
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
  }

  await (admin as any).from('admin_actions').insert({
    admin_id: user.id,
    action_type: 'update_setting',
    target_table: 'app_settings',
    target_id: key,
    reason: `${key} = ${value}`,
  })

  return NextResponse.json({ ok: true })
}
