import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  // M-6: fail fast if admin not configured — prevents silent 403 masking bad config
  if (!process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 503 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, contentType, contentId, reportId, reason } = body
  const admin = createAdminClient()

  if (action === 'delete_content') {
    if (contentType === 'post') {
      await (admin as any).from('posts').delete().eq('id', contentId)
    } else if (contentType === 'class') {
      await (admin as any).from('classes').update({ status: 'cancelled' }).eq('id', contentId)
      // M-4: clean up chats so cancelled class data doesn't linger
      await (admin as any).from('chats').delete().eq('class_id', contentId)
    } else {
      return NextResponse.json({ error: 'Unknown contentType' }, { status: 400 })
    }
    if (reportId) {
      await (admin as any).from('reports').update({ status: 'reviewed' }).eq('id', reportId)
    }
    await (admin as any).from('admin_actions').insert({
      admin_id: user.id,
      action_type: 'delete_content',
      target_table: contentType === 'post' ? 'posts' : 'classes',
      target_id: contentId,
      report_id: reportId ?? null,
      reason: reason ?? null,
    })
  } else if (action === 'dismiss_report') {
    if (!reportId) return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
    await (admin as any).from('reports').update({ status: 'dismissed' }).eq('id', reportId)
    await (admin as any).from('admin_actions').insert({
      admin_id: user.id,
      action_type: 'dismiss_report',
      target_table: 'reports',
      target_id: reportId,
      report_id: reportId,
      reason: reason ?? null,
    })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
