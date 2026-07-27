import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublishChoiceClient from '@/components/publish/PublishChoiceClient'
import { getActiveTier } from '@/lib/subscription'

export default async function PublishPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileRes, tier, postCountRes] = await Promise.all([
    supabase.from('profiles').select('city').eq('id', user.id).single(),
    // getActiveTier aplica la ventana de gracia igual que get_user_tier() en la
    // DB; leer `subscriptions` a mano dejaba la UI y los triggers desalineados.
    getActiveTier(user.id, supabase as any),
    // Solo los videos EXPUESTOS ocupan cupo del plan (060_post_plan_visibility).
    supabase.from('posts' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('plan_hidden_at', null),
  ])

  const videoPostCount = postCountRes.count ?? 0

  return (
    <PublishChoiceClient
      userId={user.id}
      userCity={profileRes.data?.city ?? null}
      tier={tier}
      videoPostCount={videoPostCount}
    />
  )
}
