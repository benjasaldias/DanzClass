import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(request: Request) {
  let userId: string
  let supabaseForSignOut: any

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
    userId = user.id
    supabaseForSignOut = anonClient
  } else {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    supabaseForSignOut = supabase
  }

  // Rate limit: destructive operation — max 5 per minute (prevents accidental loops)
  const deleteLimit = await checkRateLimit(`account:delete:${userId}`, 'destructive')
  if (deleteLimit) return deleteLimit

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const tombstoneEmail = `deleted-${userId}@deleted.danzclass.internal`

  // Anonymize profile data and mark as deleted
  await admin.from('profiles').update({
    full_name: 'Usuario eliminado',
    username: `deleted_${Date.now()}`,
    bio: null,
    avatar_url: null,
    instagram_handle: null,
    city: null,
    styles_dancing: [],
    styles_teaching: [],
    deleted_at: now,
  } as any).eq('id', userId)

  // Cancel active subscription (soft-cancel only — no MP API call in MVP)
  await admin.from('subscriptions').update({ status: 'cancelled' } as any)
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])

  // Tombstone the auth email so the user cannot sign back in
  await admin.auth.admin.updateUserById(userId, {
    email: tombstoneEmail,
    email_confirm: true,
  })

  // Sign out the current session
  await supabaseForSignOut.auth.signOut()

  return NextResponse.json({ ok: true })
}
