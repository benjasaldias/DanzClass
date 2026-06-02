import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export type AuthedUser = { id: string; email: string | null }

/**
 * Authenticate the request via Bearer token (mobile) or cookie (web).
 * Returns the user or a 401 response.
 */
export async function requireUser(request: Request): Promise<{ user: AuthedUser } | { error: NextResponse }> {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    // Reject oversized tokens before hitting Supabase (valid JWTs are well under 2048 chars)
    if (token.length > 2048) return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await anon.auth.getUser()
    if (data.user) return { user: { id: data.user.id, email: data.user.email ?? null } }
  }

  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user) return { user: { id: data.user.id, email: data.user.email ?? null } }

  return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
}
