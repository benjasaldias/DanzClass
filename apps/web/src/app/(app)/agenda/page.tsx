import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AgendaClient from '@/components/agenda/AgendaClient'

export default async function AgendaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: enrollments }, { data: teachingClasses }, { data: rehearsalData }, { data: myInvites }] = await Promise.all([
    (supabase as any)
      .from('enrollments')
      .select(`
        class:classes(
          id, title, dance_style, class_type, type, recurrence,
          date, time, start_date, ends_at, ends_indefinitely,
          custom_dates, recurring_time, day_of_week,
          teacher:profiles!teacher_id(full_name, username)
        )
      `)
      .eq('student_id', user.id)
      .in('status', ['confirmed', 'pending_payment', 'payment_submitted']),

    (supabase as any)
      .from('classes')
      .select(`
        id, title, dance_style, class_type, type, recurrence,
        date, time, start_date, ends_at, ends_indefinitely,
        custom_dates, recurring_time, day_of_week
      `)
      .eq('teacher_id', user.id)
      .eq('status', 'active'),

    // Ensayos: RLS retorna solo los del creador + invitados (cualquier estado)
    (supabase as any)
      .from('rehearsals')
      .select('id, title, date_mode, rehearsal_date, rehearsal_time, custom_dates, coordinate_month, duration_minutes, creator_id')
      .eq('status', 'active'),

    // Estado de invitaciones del usuario para filtrar rechazadas
    (supabase as any)
      .from('rehearsal_invites')
      .select('rehearsal_id, status')
      .eq('user_id', user.id),
  ])

  const enrolled = (enrollments as any[] ?? [])
    .map((e: any) => e.class)
    .filter(Boolean)

  const teaching = (teachingClasses as any[] ?? [])

  // De-duplicate: if user teaches a class they're also enrolled in, show it only as "teaching"
  const teachingIds = new Set(teaching.map((c: any) => c.id))
  const enrolledFiltered = enrolled.filter((c: any) => !teachingIds.has(c.id))

  // Build invite status map so we can filter rejected rehearsals
  const inviteMap = new Map<string, string>(
    (myInvites as any[] ?? []).map((i: any) => [i.rehearsal_id, i.status])
  )

  // Include rehearsals where: creator, OR invite accepted, OR invite pending
  // Exclude: rejected invites
  const rehearsals = (rehearsalData as any[] ?? [])
    .map((r: any) => ({
      ...r,
      invite_status: r.creator_id === user.id ? 'creator' : (inviteMap.get(r.id) ?? null),
    }))
    .filter((r: any) =>
      r.invite_status === 'creator' ||
      r.invite_status === 'accepted' ||
      r.invite_status === 'pending'
    )

  return (
    <AgendaClient
      enrolledClasses={enrolledFiltered}
      teachingClasses={teaching}
      rehearsals={rehearsals}
      currentUserId={user.id}
    />
  )
}
