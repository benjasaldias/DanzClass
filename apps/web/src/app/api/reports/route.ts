import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { contentType, contentId, reason, description } = body

  if (!contentType || !contentId || !reason) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Insert the report
  const { error: reportErr } = await (admin as any).from('reports').insert({
    reporter_id: user.id,
    content_type: contentType,
    content_id: contentId,
    reason,
    description: description?.trim() || null,
  })

  if (reportErr) {
    if (reportErr.code === '23505') {
      return NextResponse.json({ error: 'duplicate' }, { status: 409 })
    }
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  // Notify superadmin if configured
  const adminUserId = process.env.SUPERADMIN_USER_ID
  if (adminUserId) {
    const { data: reporterProfile } = await admin
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single()

    await (admin as any).from('notifications').insert({
      user_id: adminUserId,
      type: 'new_report',
      data: {
        reporter_id: user.id,
        reporter_name: (reporterProfile as any)?.username ?? user.email,
        content_type: contentType,
        content_id: contentId,
        reason,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
