import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach, SUBSCRIPTION_PLANS } from '@danceclass/shared'
import Link from 'next/link'
import { Settings, CreditCard, Crown } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import LogoutButton from '@/components/ui/LogoutButton'

const TIER_LABELS: Record<string, string> = {
  none: 'Sin plan',
  basic: 'Plan Básico',
  teacher: 'Plan Profesor',
  pro: 'Plan Pro',
}

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio?: string | null
  city?: string | null
}

export default async function ProfilePage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [
    { data: profileData },
    tier,
    { count: followersCount },
    { count: followingCount },
  ] = await Promise.all([
    supabase.from('profiles' as any).select('*').eq('id', user.id).single(),
    getActiveTier(user.id, supabase as any),
    supabase
      .from('follows' as any)
      .select('*', { count: 'exact', head: true })
      .eq('following_id', user.id),
    supabase
      .from('follows' as any)
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', user.id),
  ])

  const profile = profileData as Profile | null
  const planInfo = SUBSCRIPTION_PLANS.find((p) => p.tier === tier)

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex flex-col items-center text-center gap-3">
        <Avatar
          src={profile?.avatar_url}
          name={profile?.full_name ?? '?'}
          size="xl"
        />

        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {profile?.full_name ?? 'Usuario'}
          </h1>

          <p className="text-sm text-gray-500">
            @{profile?.username ?? 'sin-usuario'}
          </p>

          <span className="mt-1 badge bg-brand-50 text-brand-700">
            {TIER_LABELS[tier] ?? 'Sin plan'}
          </span>
        </div>

        {profile?.bio && (
          <p className="text-sm text-gray-600">{profile.bio}</p>
        )}

        <div className="flex gap-6 text-sm text-gray-500">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">
              {followersCount ?? 0}
            </p>
            <p>seguidores</p>
          </div>

          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">
              {followingCount ?? 0}
            </p>
            <p>siguiendo</p>
          </div>
        </div>
      </div>

      {/* Suscripción */}
      <div className="card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-brand-500" />

          <div>
            <p className="text-sm font-medium text-gray-900">
              {TIER_LABELS[tier] ?? 'Sin plan'}
            </p>

            {planInfo && (
              <p className="text-xs text-gray-500">
                {planInfo.description}
              </p>
            )}
          </div>
        </div>

        <Link
          href="/plans"
          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          {tier === 'none' ? 'Suscribirse' : 'Cambiar'}
        </Link>
      </div>

      {/* Settings links */}
      <div className="card divide-y divide-gray-100">
        <Link
          href="/profile/edit"
          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
        >
          <Settings className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            Editar perfil
          </span>
        </Link>

        {canTeach(tier) && (
          <Link
            href="/profile/payment-info"
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
          >
            <CreditCard className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Datos bancarios
            </span>
          </Link>
        )}

        <LogoutButton />
      </div>
    </div>
  )
}