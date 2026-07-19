import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/ui/BottomNav'
import PublishFab from '@/components/ui/PublishFab'
import TopBar from '@/components/ui/TopBar'
import RatingPopupLoader from '@/components/ui/RatingPopup'
import type { SubscriptionTier } from '@danceclass/shared'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Rutas públicas dentro de este grupo (solo /feed) pueden renderizar sin sesión.
  // El resto de las rutas del grupo están protegidas por el middleware, que ya
  // redirige a login antes de llegar aquí, así que `user` solo es null en /feed.
  if (!user) {
    return (
      <div className="min-h-screen bg-blanco-violeta dark:bg-dark-bg flex flex-col">
        <TopBar profile={null} unreadCount={0} />
        <main className="flex-1 pb-app-nav pt-app-header max-w-lg mx-auto w-full">
          {children}
        </main>
        <BottomNav />
      </div>
    )
  }

  const [{ data: profile }, { data: subscription }, { count: unreadCount }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('subscriptions')
      .select('tier, status, expires_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'grace'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false),
  ])

  type SubRow = { expires_at: string; tier: string }
  const now = new Date()
  let activeTier: SubscriptionTier = 'none'
  const sub = subscription as SubRow | null
  if (sub) {
    const graceCutoff = new Date(new Date(sub.expires_at).getTime() + 7 * 24 * 60 * 60 * 1000)
    if (graceCutoff > now) {
      activeTier = sub.tier as SubscriptionTier
    }
  }

  return (
    <div className="min-h-screen bg-blanco-violeta dark:bg-dark-bg flex flex-col">
      <TopBar profile={profile} unreadCount={unreadCount ?? 0} />
      <main className="flex-1 pb-app-nav pt-app-header max-w-lg mx-auto w-full">
        {children}
      </main>
      <PublishFab tier={activeTier} />
      <BottomNav />
      <RatingPopupLoader userId={user.id} />
    </div>
  )
}
