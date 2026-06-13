import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { contentType, contentId, reason, description } = body

  if (!contentType || !contentId || !reason) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Validate enums + id format server-side (clients/DB CHECK aside) and cap the
  // free-text length to prevent malformed inserts and storage-abuse via reports.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!['post', 'class'].includes(contentType)) {
    return NextResponse.json({ error: 'invalid_contentType' }, { status: 400 })
  }
  if (!['copyright', 'inappropriate', 'spam', 'other'].includes(reason)) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  }
  if (typeof contentId !== 'string' || !UUID_RE.test(contentId)) {
    return NextResponse.json({ error: 'invalid_contentId' }, { status: 400 })
  }
  const cleanDescription =
    typeof description === 'string' ? description.trim().slice(0, 1000) : ''

  const admin = createAdminClient()

  // Insert the report
  const { error: reportErr } = await (admin as any).from('reports').insert({
    reporter_id: user.id,
    content_type: contentType,
    content_id: contentId,
    reason,
    description: cleanDescription || null,
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
