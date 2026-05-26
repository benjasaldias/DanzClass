import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ tier: 'none' })

  const tier = await getActiveTier(user.id, supabase)
  return NextResponse.json({ tier })
}
