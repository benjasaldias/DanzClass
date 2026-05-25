import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { classId, applicantIds } = body as { classId?: string; applicantIds?: string[] }

  if (!classId || !Array.isArray(applicantIds) || applicantIds.length === 0) {
    return NextResponse.json({ error: 'classId and applicantIds required' }, { status: 400 })
  }

  // Auth: Bearer token (mobile) or cookie (web)
  let userId: string
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const anonClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  }

  const admin = createAdminClient()

  // Verify caller is teacher of this class
  const { data: cls } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .single()

  if (!cls || (cls as any).teacher_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let created = 0
  for (const applicantId of applicantIds) {
    const { data: existing } = await admin
      .from('enrollments')
      .select('id, status')
      .eq('student_id', applicantId)
      .eq('class_id', classId)
      .is('session_id', null)
      .maybeSingle()

    if (!existing) {
      await admin.from('enrollments').insert({
        student_id: applicantId,
        class_id: classId,
        status: 'pending_payment',
      })
      created++
    } else if ((existing as any).status === 'cancelled') {
      await admin.from('enrollments').update({ status: 'pending_payment' }).eq('id', (existing as any).id)
      created++
    }
    // else: already active — leave untouched
  }

  return NextResponse.json({ ok: true, created })
}
