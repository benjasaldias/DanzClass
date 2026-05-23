import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { classId } = body as { classId?: string }
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 })

  // Auth: Bearer token (mobile) or cookie (web)
  let supabase: ReturnType<typeof createClient>
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const anonClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    supabase = anonClient as any
  } else {
    supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify class exists and is active
  const { data: cls } = await supabase
    .from('classes')
    .select('id, status')
    .eq('id', classId)
    .eq('status', 'active')
    .maybeSingle()

  if (!cls) return NextResponse.json({ error: 'Clase no encontrada o no activa' }, { status: 404 })

  // Verify user is not already enrolled (confirmed)
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id')
    .eq('class_id', classId)
    .eq('student_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya estás inscrito en esta clase' }, { status: 409 })

  // Insert — ignore duplicate silently
  const { error } = await (supabase as any)
    .from('waitlist')
    .insert({ class_id: classId, user_id: user.id })

  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
