import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MyClassesClient from '@/components/class/MyClassesClient'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'

export default async function MyClassesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: enrollments }, { data: teachingClasses }, tier] = await Promise.all([
    supabase
      .from('enrollments')
      .select(`
        *,
        class:classes(
          *,
          teacher:profiles!teacher_id(*),
          media:class_media(*)
        ),
        payment:payments(*)
      `)
      .eq('student_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),

    supabase
      .from('classes')
      .select(`
        *,
        enrollments(
          *,
          student:profiles!student_id(*),
          payment:payments(*)
        )
      `)
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),

    getActiveTier(user.id, supabase),
  ])

  return (
    <MyClassesClient
      enrollments={(enrollments as any[]) ?? []}
      teachingClasses={(teachingClasses as any[]) ?? []}
      defaultTab={canTeach(tier) ? 'teaching' : 'enrolled'}
    />
  )
}
