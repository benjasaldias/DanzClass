import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach, SUBSCRIPTION_PLANS, DAYS_OF_WEEK } from '@danceclass/shared'
import { Crown, Settings, CreditCard, MapPin, Users, BookOpen, Star, Instagram, Music2, Video, Trash2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import LogoutButton from '@/components/ui/LogoutButton'
import ThemeToggle from '@/components/ui/ThemeToggle'
import PostCard from '@/components/feed/PostCard'
import StarRating from '@/components/ui/StarRating'
import { formatCLP, formatDate, formatTime } from '@/lib/utils'

const TIER_LABELS: Record<string, string> = {
  none: 'Sin plan',
  basic: 'Plan Básico',
  teacher: 'Plan Profesor',
  pro: 'Plan Pro',
}

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: profileData },
    tier,
    { count: followersCount },
    { count: classesCount },
    { count: paidSpotsCount },
    { data: ratingRows },
    { data: classes },
    { data: enrolledData },
    { data: ownPostsData },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getActiveTier(user.id, supabase as any),
    supabase.from('follows' as any).select('*', { count: 'exact', head: true }).eq('following_id', user.id),
    // D-9/D-10: excluir clases canceladas (soft-deleted)
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', user.id)
      .in('status', ['active', 'completed']),
    (supabase as any)
      .from('enrollments')
      .select('*, class:classes!inner(*)', { count: 'exact', head: true })
      .eq('class.teacher_id', user.id)
      .eq('status', 'confirmed'),
    (supabase as any).from('ratings').select('stars').eq('rated_user_id', user.id),
    (supabase as any)
      .from('classes')
      .select('*, media:class_media(*)')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('enrollments')
      .select('*, class:classes(*, media:class_media(*))')
      .eq('student_id', user.id)
      .in('status', ['confirmed', 'payment_submitted'])
      .order('created_at', { ascending: false })
      .limit(10),
    (supabase as any)
      .from('posts')
      .select('*, user:profiles!user_id(id, full_name, username, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const profile = profileData as any
  const planInfo = SUBSCRIPTION_PLANS.find((p) => p.tier === tier)
  const enrolledClasses = (enrolledData as any[]) ?? []
  const ownPosts = (ownPostsData as any[]) ?? []
  const ratingList = (ratingRows as any[]) ?? []
  const ratingCount = ratingList.length
  const avgRating = ratingCount > 0
    ? Math.round((ratingList.reduce((a: number, r: any) => a + Number(r.stars), 0) / ratingCount) * 10) / 10
    : 0

  return (
    <div className="flex flex-col">
      {/* Theme toggle — top-right */}
      <div className="flex justify-end px-4 pt-3">
        <ThemeToggle />
      </div>

      {/* Header */}
      <div className="px-4 py-4 flex flex-col items-center text-center gap-3">
        <Avatar src={profile?.avatar_url} name={profile?.full_name ?? '?'} size="xl" />

        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">{profile?.full_name ?? 'Usuario'}</h1>
          <p className="text-sm text-gray-500 dark:text-dark-text2">@{profile?.username ?? 'sin-usuario'}</p>
        </div>

        {profile?.bio && (
          <p className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed max-w-xs">{profile.bio}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text2 flex-wrap justify-center">
          {profile?.city && (
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{profile.city}</span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <strong className="text-gray-900 dark:text-dark-text">{followersCount ?? 0}</strong> seguidores
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap justify-center mt-1">
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-gray-900 dark:text-dark-text">{classesCount ?? 0}</span>
            <span className="text-[11px] text-gray-500 dark:text-dark-text2 flex items-center gap-0.5"><BookOpen className="h-3 w-3" /> clases dictadas</span>
          </div>
          <div className="h-7 w-px bg-gray-200 dark:bg-dark-border" />
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-gray-900 dark:text-dark-text">{paidSpotsCount ?? 0}</span>
            <span className="text-[11px] text-gray-500 dark:text-dark-text2 flex items-center gap-0.5"><Star className="h-3 w-3" /> cupos pagados</span>
          </div>
          {canTeach(tier) && (
            <>
              <div className="h-7 w-px bg-gray-200 dark:bg-dark-border" />
              <div className="flex flex-col items-center">
                {ratingCount > 0
                  ? <StarRating value={avgRating} count={ratingCount} size="sm" />
                  : <span className="text-xs text-gray-400 dark:text-dark-text2">Sin valoraciones</span>
                }
              </div>
            </>
          )}
        </div>

        {profile?.instagram_handle && (
          <a href={`https://instagram.com/${profile.instagram_handle}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-700">
            <Instagram className="h-4 w-4" />@{profile.instagram_handle}
          </a>
        )}

        {/* Own-profile action buttons */}
        <div className="flex gap-2 flex-wrap justify-center">
          <Link
            href="/profile/edit"
            className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-brand-400 dark:hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Editar perfil
          </Link>

          {canTeach(tier) && (
            <Link
              href="/profile/payment-info"
              className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-brand-400 dark:hover:border-brand-400 hover:text-brand-700 transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Datos Transferencia
            </Link>
          )}

          <LogoutButton asButton />
        </div>

        {/* Danger zone */}
        <div className="mt-2">
          <Link
            href="/profile/delete-account"
            className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar cuenta
          </Link>
        </div>
      </div>

      {/* Subscription banner */}
      <div className="mx-4 mb-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-brand-500 dark:text-brand-300" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text">{TIER_LABELS[tier] ?? 'Sin plan'}</p>
            {planInfo && <p className="text-xs text-gray-500 dark:text-dark-text2">{planInfo.description}</p>}
          </div>
        </div>
        <Link href="/plans" className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:text-brand-700">
          {tier === 'none' ? 'Suscribirse' : 'Cambiar'}
        </Link>
      </div>

      {/* Estilos de baile */}
      {((profile?.styles_dancing?.length ?? 0) > 0 || (profile?.styles_teaching?.length ?? 0) > 0) && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-dark-border pt-4">
          {(profile?.styles_dancing?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Baila</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.styles_dancing.map((s: string) => (
                  <span key={s} className="badge bg-lavanda-suave text-violeta-oscuro">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(profile?.styles_teaching?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enseña</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.styles_teaching.map((s: string) => (
                  <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clases publicadas */}
      {(classes ?? []).length > 0 && (
        <div className="px-4 pb-6 border-t border-gray-100 dark:border-dark-border pt-4">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-3">Mis clases activas</h2>
          <div className="space-y-3">
            {(classes ?? []).map((cls: any) => <ClassMiniCard key={cls.id} cls={cls} />)}
          </div>
        </div>
      )}

      {/* Inscripciones */}
      {enrolledClasses.length > 0 && (
        <div className="px-4 pb-6 border-t border-gray-100 dark:border-dark-border pt-4">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-3">Mis inscripciones</h2>
          <div className="space-y-3">
            {enrolledClasses.map((e: any) => e.class && <ClassMiniCard key={e.id} cls={e.class} />)}
          </div>
        </div>
      )}

      {/* Publicaciones propias */}
      {ownPosts.length > 0 && (
        <div className="border-t border-gray-100 dark:border-dark-border pt-4 pb-2">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-1 px-4 flex items-center gap-2">
            <Video className="h-4 w-4 text-brand-500 dark:text-brand-300" />
            Mis publicaciones
          </h2>
          <div>
            {ownPosts.map((post: any) => (
              <PostCard key={post.id} post={post} currentUserId={user.id} />
            ))}
          </div>
        </div>
      )}

      {(classes ?? []).length === 0 && enrolledClasses.length === 0 && ownPosts.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center text-gray-500 dark:text-dark-text2 border-t border-gray-100 dark:border-dark-border">
          <Music2 className="h-10 w-10 text-gray-300 dark:text-dark-border mb-3" />
          <p className="text-sm">Sin actividad pública aún</p>
        </div>
      )}
    </div>
  )
}

function ClassMiniCard({ cls }: { cls: any }) {
  const firstMedia = cls.media?.[0]
  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const schedule = cls.type === 'suelta'
    ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
    : cls.recurrence === 'custom'
      ? `${cls.custom_dates?.length ?? 0} clases · ${formatTime(cls.recurring_time)}`
      : `${recurrenceLabel[cls.recurrence] ?? ''} · ${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`

  return (
    <Link href={`/class/${cls.id}`} className="card dark:bg-dark-surface dark:border-dark-border flex gap-3 p-3 hover:shadow-md transition-shadow">
      {firstMedia ? (
        <div className="relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
          {firstMedia.type === 'image'
            ? <Image src={firstMedia.url} alt={cls.title} fill className="object-cover" sizes="80px" />
            : <video src={firstMedia.url} className="h-full w-full object-cover" />}
        </div>
      ) : (
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-dark-surface2">
          <Music2 className="h-8 w-8 text-brand-400 dark:text-brand-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{cls.title}</p>
        {cls.dance_style && (
          <p className="text-xs text-brand-600 dark:text-brand-300">
            {cls.dance_style}{cls.class_type ? ` - ${cls.class_type}` : ''}
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-dark-text2 mt-1">{schedule}</p>
        <p className="mt-1 text-sm font-bold text-gray-900 dark:text-dark-text">{formatCLP(cls.price)}</p>
        {cls.price_suelta && (
          <p className="text-xs text-gray-400 dark:text-dark-text2">Suelta: {formatCLP(cls.price_suelta)}</p>
        )}
      </div>
    </Link>
  )
}
