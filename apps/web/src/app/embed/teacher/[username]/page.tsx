import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime, formatCLP } from '@/lib/utils'
import { DAYS_OF_WEEK, LEVEL_LABELS, WEB_URL } from '@danceclass/shared'
import type { Metadata } from 'next'

interface Props {
  params: { username: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Clases de @${params.username} · DanzClass`,
    robots: { index: false },
  }
}

export default async function EmbedTeacherPage({ params }: Props) {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, username, avatar_url, city')
    .eq('username', params.username)
    .single()

  if (!profile) notFound()

  const { data: rawClasses } = await (supabase as any)
    .from('classes')
    .select('*, media:class_media(*), enrollments(id, status)')
    .eq('teacher_id', profile.id)
    .eq('status', 'active')
    .or(`type.neq.suelta,date.gte.${today}`)
    .or(`type.eq.suelta,ends_at.is.null,ends_indefinitely.is.true,ends_at.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(10)

  const classes = ((rawClasses ?? []) as any[]).filter((c: any) => {
    if (c.recurrence === 'custom') {
      return (c.custom_dates ?? []).some((d: string) => d >= today)
    }
    return true
  })

  const appUrl = process.env.APP_URL ?? WEB_URL

  return (
    <div style={{ padding: '12px', maxWidth: '480px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', background: 'white', borderRadius: 12, border: '1px solid #EEEDFE' }}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c026d3', fontWeight: 700, fontSize: 14 }}>
            {(profile.full_name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{profile.full_name}</div>
          <div style={{ fontSize: 12, color: '#6B6880' }}>@{profile.username}</div>
        </div>
        <a
          href={`${appUrl}/teacher/${profile.username}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 600, color: '#c026d3', textDecoration: 'none', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 20, padding: '4px 10px' }}
        >
          Ver perfil
        </a>
      </div>

      {/* Class list */}
      {classes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9CA3AF', fontSize: 13 }}>
          Sin clases activas por el momento
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {classes.map((cls: any) => {
            const firstMedia = cls.media?.[0]
            const spotsTotal = cls.max_students ?? 0
            const spotsUsed = (cls.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
            const spotsLeft = spotsTotal - spotsUsed

            const scheduleLabel = cls.type === 'suelta'
              ? formatDate(cls.date)
              : cls.recurrence === 'custom'
                ? `${(cls.custom_dates ?? []).length} fechas`
                : `${DAYS_OF_WEEK[cls.day_of_week] ?? ''} · ${formatTime(cls.recurring_time)}`

            const levelLabel = cls.level ? LEVEL_LABELS[cls.level as keyof typeof LEVEL_LABELS] : null

            return (
              <a
                key={cls.id}
                href={`${appUrl}/class/${cls.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'white', borderRadius: 12, border: '1px solid #EEEDFE', textDecoration: 'none', alignItems: 'center' }}
              >
                {firstMedia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={firstMedia.url}
                    alt={cls.title}
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
                    🎵
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cls.title}
                  </div>
                  {cls.dance_style && (
                    <div style={{ fontSize: 11, color: '#c026d3', fontWeight: 600, marginTop: 1 }}>
                      {cls.dance_style}{levelLabel ? ` · ${levelLabel}` : ''}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#6B6880', marginTop: 2 }}>{scheduleLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: cls.discount_price ? '#D85A30' : '#111827' }}>
                      {formatCLP(cls.discount_price ?? cls.price)}
                      {cls.discount_price && (
                        <span style={{ fontWeight: 400, color: '#9CA3AF', textDecoration: 'line-through', fontSize: 11, marginLeft: 4 }}>
                          {formatCLP(cls.price)}
                        </span>
                      )}
                    </div>
                    {spotsTotal > 0 && (
                      <div style={{ fontSize: 11, color: spotsLeft <= 3 ? '#D85A30' : '#6B6880' }}>
                        {spotsLeft > 0 ? `${spotsLeft}/${spotsTotal} cupos` : 'Sin cupos'}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#A39BBF' }}>
        <a href={appUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#c026d3', textDecoration: 'none', fontWeight: 600 }}>
          DanzClass
        </a>
        {' '}· Inscríbete en la plataforma
      </div>
    </div>
  )
}
