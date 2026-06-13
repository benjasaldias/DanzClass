'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Reason = 'copyright' | 'inappropriate' | 'spam' | 'other'
type ContentType = 'post' | 'class'

interface ReportResult {
  ok: boolean
  error?: 'duplicate' | 'unauthorized' | 'invalid' | 'failed'
}

export async function submitReport(params: {
  contentType: ContentType
  contentId: string
  reason: Reason
  description?: string
}): Promise<ReportResult> {
  const { contentType, contentId, reason, description } = params

  if (!contentType || !contentId || !reason) {
    return { ok: false, error: 'invalid' }
  }

  // Validate enums + id format and cap free-text length (defense in depth — a
  // direct server-action call can supply arbitrary args, bypassing the modal UI).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!['post', 'class'].includes(contentType)) return { ok: false, error: 'invalid' }
  if (!['copyright', 'inappropriate', 'spam', 'other'].includes(reason)) {
    return { ok: false, error: 'invalid' }
  }
  if (typeof contentId !== 'string' || !UUID_RE.test(contentId)) {
    return { ok: false, error: 'invalid' }
  }
  const cleanDescription =
    typeof description === 'string' ? description.trim().slice(0, 1000) : ''

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const admin = createAdminClient()

  const { error: reportErr } = await (admin as any).from('reports').insert({
    reporter_id: user.id,
    content_type: contentType,
    content_id: contentId,
    reason,
    description: cleanDescription || null,
  })

  if (reportErr) {
    if (reportErr.code === '23505') return { ok: false, error: 'duplicate' }
    return { ok: false, error: 'failed' }
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

  return { ok: true }
}
