import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier, getActiveSubscription } from '@/lib/subscription'
import { canTeach, SUBSCRIPTION_PLANS, DAYS_OF_WEEK } from '@danceclass/shared'
import { Crown, Settings, CreditCard, Instagram, Music2, Video, Trash2, AlertCircle, Gift, TrendingUp, ChevronRight, Eye, FileText, ShieldCheck, MessageSquareWarning } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import LogoutButton from '@/components/ui/LogoutButton'
import StyleChip from '@/components/ui/StyleChip'
import AppearanceRow from '@/components/profile/AppearanceRow'
import AiScanPreferenceCard from '@/components/profile/AiScanPreferenceCard'
import ProfilePostsGrid from '@/components/profile/ProfilePostsGrid'
import EmbedWidgetButton from '@/components/profile/EmbedWidgetButton'
import ReferralCopyButton from '@/components/profile/ReferralCopyButton'
import ProfileTabs, { type ProfileTab } from '@/components/profile/ProfileTabs'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'

const TIER_LABELS: Record<string, string> = {
  none: 'Sin plan',
  basic: 'Plan Básico',
  teacher: 'Plan Profesor',
  pro: 'Plan Pro',
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: profileData },
    tier,
    activeSub,
    { count: followersCount },
    { count: classesCount },
    { count: paidSpotsCount },
    { count: classesTakenCount },
    { data: ratingRows },
    { data: classes },
    { data: enrolledData },
    { data: ownPostsData },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getActiveTier(user.id, supabase as any),
    getActiveSubscription(user.id, supabase as any),
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
    (supabase as any)
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
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

  const isTeacher = canTeach(tier)
  const subActive = tier !== 'none'

  // Stats: profesores ven 4, alumnos 2.
  const stats: { value: React.ReactNode; label: string }[] = isTeacher
    ? [
        {
          value: ratingCount > 0
            ? <span className="text-amber-500">★ {avgRating}</span>
            : <span className="text-gray-400 dark:text-dark-text2">—</span>,
          label: ratingCount > 0 ? `${ratingCount} valoraciones` : 'valoraciones',
        },
        { value: followersCount ?? 0, label: 'seguidores' },
        { value: classesCount ?? 0, label: 'clases dictadas' },
        { value: paidSpotsCount ?? 0, label: 'cupos pagados' },
      ]
    : [
        { value: classesTakenCount ?? 0, label: 'clases tomadas' },
        { value: followersCount ?? 0, label: 'seguidores' },
      ]

  return (
    <div className="flex flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-dark-surface px-4 pt-6 pb-5 text-center border-b border-gray-100 dark:border-dark-border">
        <div className="relative inline-block">
          <Avatar src={profile?.avatar_url} name={profile?.full_name ?? '?'} size="xl" className="mx-auto" />
          <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-500 border-[3px] border-white dark:border-dark-surface" />
        </div>

        <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-dark-text">{profile?.full_name ?? 'Usuario'}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-dark-text2">
          @{profile?.username ?? 'sin-usuario'}
          {profile?.city && <> · {profile.city}</>}
        </p>

        {profile?.bio && (
          <p className="mx-auto mt-2.5 max-w-xs text-sm leading-relaxed text-gray-600 dark:text-dark-text2">{profile.bio}</p>
        )}

        {profile?.instagram_handle && (
          <a
            href={`https://instagram.com/${profile.instagram_handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-700"
          >
            <Instagram className="h-4 w-4" />@{profile.instagram_handle}
          </a>
        )}

        {/* stats row */}
        <div className="mt-4 flex items-stretch border-t border-gray-100 dark:border-dark-border pt-4">
          {stats.map((s, i) => (
            <div
              key={i}
              className={cn('flex-1 px-1', i < stats.length - 1 && 'border-r border-gray-100 dark:border-dark-border')}
            >
              <p className="text-base font-bold text-gray-900 dark:text-dark-text">{s.value}</p>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-dark-text2">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Suscripción (tappable) ─────────────────────────── */}
      <Link
        href="/plans"
        className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-dark-border bg-gradient-to-r from-lavanda-suave/70 to-white px-4 py-3.5 dark:from-dark-surface2 dark:to-dark-surface"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Crown className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-dark-text">{TIER_LABELS[tier] ?? 'Sin plan'}</span>
              {subActive && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Activo
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-dark-text2">
              {planInfo?.description ?? 'Conoce los planes disponibles'}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300 dark:text-dark-text2" />
      </Link>

      {/* Subscription expiry warning — shown 7 days before expiry */}
      {activeSub && (() => {
        const daysLeft = Math.ceil((new Date(activeSub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysLeft > 7) return null
        const [y, m, d] = activeSub.expires_at.split('T')[0].split('-').map(Number)
        const label = new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
        return (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Tu plan vence el <span className="font-semibold">{label}</span>.{' '}
              <Link href="/plans" className="underline">Renovar ahora</Link>
            </p>
          </div>
        )
      })()}

      {/* ── Acción primaria ────────────────────────────────── */}
      <div className="flex gap-2 px-4 py-3">
        <Link href="/profile/edit" className="btn-primary flex-1">
          <Settings className="h-4 w-4" />
          Editar perfil
        </Link>
        {profile?.username && (
          <Link
            href={`/teacher/${profile.username}`}
            aria-label="Ver perfil público"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text2 dark:hover:bg-dark-surface2"
          >
            <Eye className="h-5 w-5" />
          </Link>
        )}
      </div>

      {/* ── Pestañas (Plan B) ──────────────────────────────── */}
      <ProfileTabs initialTab={searchParams?.tab} tabs={buildTabs()} />
    </div>
  )

  /* ── Contenido de cada pestaña ──────────────────────────── */

  function buildTabs(): ProfileTab[] {
    const hasStyles = (profile?.styles_dancing?.length ?? 0) > 0 || (profile?.styles_teaching?.length ?? 0) > 0
    const isEmptyProfile =
      (classes ?? []).length === 0 && enrolledClasses.length === 0 && ownPosts.length === 0 && !hasStyles

    const perfil = (
      <div className="pt-3">
        {/* Estilos de baile */}
        {hasStyles && (
          <SectionCard title="Estilos de baile">
            <div className="space-y-3">
              {(profile?.styles_dancing?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text2">Baila</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.styles_dancing.map((s: string) => <StyleChip key={s} style={s} />)}
                  </div>
                </div>
              )}
              {(profile?.styles_teaching?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-text2">Enseña</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.styles_teaching.map((s: string) => <StyleChip key={s} style={s} />)}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Mis clases activas */}
        {(classes ?? []).length > 0 && (
          <SectionCard title="Mis clases activas">
            <div className="space-y-3">
              {(classes ?? []).map((cls: any) => <ClassMiniCard key={cls.id} cls={cls} />)}
            </div>
          </SectionCard>
        )}

        {/* Mis inscripciones */}
        {enrolledClasses.length > 0 && (
          <SectionCard title="Mis inscripciones">
            <div className="space-y-3">
              {enrolledClasses.map((e: any) => e.class && <ClassMiniCard key={e.id} cls={e.class} />)}
            </div>
          </SectionCard>
        )}

        {/* Mis publicaciones (grilla estilo Instagram) */}
        {ownPosts.length > 0 && (
          <SectionCard
            title="Mis publicaciones"
            bleed
            action={<span className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 dark:text-dark-text2"><Video className="h-3.5 w-3.5" /> {ownPosts.length}</span>}
          >
            <div className="px-0.5 pb-0.5">
              <ProfilePostsGrid posts={ownPosts} currentUserId={user!.id} />
            </div>
          </SectionCard>
        )}

        {isEmptyProfile && (
          <div className="flex flex-col items-center py-14 text-center text-gray-500 dark:text-dark-text2">
            <Music2 className="h-10 w-10 text-gray-300 dark:text-dark-border mb-3" />
            <p className="text-sm">Sin actividad pública aún</p>
          </div>
        )}
      </div>
    )

    const gestion = (
      <div className="pt-3">
        <SectionCard title="Herramientas de profesor" bleed>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            <SettingRow
              href="/financiero"
              icon={TrendingUp}
              title="Panel Financiero"
              sub="Ingresos y estadísticas"
              tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            />
            <SettingRow href="/profile/payment-info" icon={CreditCard} title="Datos de pago" sub="Para recibir transferencias" />
            {profile?.username && (
              <EmbedWidgetButton
                username={profile.username}
                appUrl={process.env.APP_URL ?? 'https://dc-project-web.vercel.app'}
                asRow
              />
            )}
          </div>
        </SectionCard>

        {/* Escaneo de comprobantes */}
        <SectionCard title="Escaneo de comprobantes">
          <AiScanPreferenceCard userId={user!.id} initialPreference={profile?.ai_scan_preference ?? null} />
        </SectionCard>
      </div>
    )

    const ajustes = (
      <div className="pt-3">
        {/* Preferencias */}
        <SectionCard title="Preferencias" bleed>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            <AppearanceRow />
            <LogoutButton asRow />
          </div>
        </SectionCard>

        {/* Referral */}
        {profile?.referral_code && (
          <div className="mx-4 mb-3 rounded-2xl border border-violet-100 dark:border-dark-border bg-violet-50/60 dark:bg-dark-surface px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Gift className="h-4 w-4 text-morado-flow" />
              <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Invita un amigo</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text2 mb-2.5 leading-relaxed">
              Comparte tu enlace. Cuando tu amigo se suscriba por primera vez, ¡ambos reciben 1 mes Pro gratis!
            </p>
            <ReferralCopyButton code={profile.referral_code} appUrl="https://danzclass.com" />
          </div>
        )}

        {/* Legal y soporte */}
        <SectionCard title="Legal y soporte" bleed>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            <SettingRow href="/terms" icon={FileText} title="Términos de uso" />
            <SettingRow href="/privacy" icon={ShieldCheck} title="Política de privacidad" />
            <a
              href="mailto:contacto@danzclass.com?subject=Error%20o%20sugerencia%20DanzClass"
              className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface2"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lavanda-suave text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200">
                <MessageSquareWarning className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">Reportar error o sugerencia</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 dark:text-dark-text2" />
            </a>
          </div>
        </SectionCard>

        {/* Danger zone */}
        <div className="flex justify-center py-5">
          <Link
            href="/profile/delete-account"
            className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar cuenta
          </Link>
        </div>
      </div>
    )

    return [
      { key: 'perfil', label: 'Perfil', content: perfil },
      // Gestión es exclusiva del profesor (herramientas de enseñanza).
      ...(isTeacher ? [{ key: 'gestion', label: 'Gestión', content: gestion }] : []),
      { key: 'ajustes', label: 'Ajustes', content: ajustes },
    ]
  }
}

/* ── Helpers ──────────────────────────────────────────────── */

function SectionCard({
  title,
  action,
  bleed = false,
  children,
}: {
  title?: string
  action?: React.ReactNode
  bleed?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-3 border-y border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
      {title && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-dark-text2">{title}</h2>
          {action}
        </div>
      )}
      <div className={bleed ? 'pb-1' : 'px-4 pb-4'}>{children}</div>
    </section>
  )
}

function SettingRow({
  href,
  icon: Icon,
  title,
  sub,
  tint,
}: {
  href: string
  icon: React.ElementType
  title: string
  sub?: string
  tint?: string
}) {
  return (
    <Link href={href} className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface2">
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', tint ?? 'bg-lavanda-suave text-violeta-oscuro dark:bg-dark-surface2 dark:text-brand-200')}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-dark-text">{title}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-dark-text2">{sub}</p>}
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 dark:text-dark-text2" />
    </Link>
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
