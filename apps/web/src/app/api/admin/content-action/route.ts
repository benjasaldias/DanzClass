import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, contentType, contentId, reportId } = body
  const admin = createAdminClient()

  if (action === 'delete_content') {
    if (contentType === 'post') {
      await (admin as any).from('posts').delete().eq('id', contentId)
    } else if (contentType === 'class') {
      await (admin as any).from('classes').update({ status: 'cancelled' }).eq('id', contentId)
    }
    if (reportId) {
      await (admin as any).from('reports').update({ status: 'reviewed' }).eq('id', reportId)
    }
  } else if (action === 'dismiss_report') {
    if (reportId) {
      await (admin as any).from('reports').update({ status: 'dismissed' }).eq('id', reportId)
    }
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
