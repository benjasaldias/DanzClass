import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import AgendaClient from '@/components/agenda/AgendaClient'

export default async function AgendaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)

  const [{ data: enrollments }, { data: teachingClasses }] = await Promise.all([
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
      .eq('status', 'confirmed'),

    canTeach(tier)
      ? (supabase as any)
          .from('classes')
          .select(`
            id, title, dance_style, class_type, type, recurrence,
            date, time, start_date, ends_at, ends_indefinitely,
            custom_dates, recurring_time, day_of_week
          `)
          .eq('teacher_id', user.id)
          .eq('status', 'active')
      : { data: [] },
  ])

  const enrolled = (enrollments as any[] ?? [])
    .map((e: any) => e.class)
    .filter(Boolean)

  const teaching = (teachingClasses as any[] ?? [])

  // De-duplicate: if user teaches a class they're also enrolled in, show it only as "teaching"
  const teachingIds = new Set(teaching.map((c: any) => c.id))
  const enrolledFiltered = enrolled.filter((c: any) => !teachingIds.has(c.id))

  return (
    <AgendaClient
      enrolledClasses={enrolledFiltered}
      teachingClasses={teaching}
    />
  )
}
