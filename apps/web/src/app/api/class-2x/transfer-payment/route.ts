import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  let user: any = null

  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const mobileSupa = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await mobileSupa.auth.getUser()
    user = data.user
  }
  if (!user) {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { request_id } = await req.json()
  if (!request_id) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })

  const admin = createAdminClient()

  const { data: request } = await admin
    .from('class_2x_requests' as any)
    .select('*')
    .eq('id', request_id)
    .eq('status', 'matched')
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const req2x = request as any

  // Only current payment assignee can transfer
  if (req2x.payment_assignee !== user.id) {
    return NextResponse.json({ error: 'Not your turn to transfer' }, { status: 403 })
  }

  const newAssignee = req2x.user_id === user.id ? req2x.matched_with : req2x.user_id

  await admin
    .from('class_2x_requests' as any)
    .update({ payment_assignee: newAssignee })
    .eq('id', request_id)

  // Notify new assignee
  await admin.from('notifications').insert({
    user_id: newAssignee,
    type: '2x_payment_turn',
    data: {
      class_id: req2x.class_id,
      request_id,
      from_user_id: user.id,
    },
  })

  return NextResponse.json({ success: true })
}
