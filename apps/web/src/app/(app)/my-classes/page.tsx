import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MyClassesClient from '@/components/class/MyClassesClient'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'

function getClassDeletionDate(cls: any): Date | null {
  const now = new Date()
  if (cls.type === 'suelta' && cls.date) {
    const classDate = new Date(cls.date)
    const deletionDate = new Date(classDate)
    deletionDate.setDate(deletionDate.getDate() + 7)
    return deletionDate
  }
  if (cls.type === 'periodica') {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0) // last day of current month
    const deletionDate = new Date(endOfMonth)
    deletionDate.setDate(deletionDate.getDate() + 7)
    return deletionDate
  }
  return null
}

export default async function MyClassesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: enrollments }, { data: teachingClasses }, tier, { data: dismissedDebts }, { data: ownRehearsals }, { data: rehearsalInvites }] = await Promise.all([
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

    (supabase as any)
      .from('classes')
      .select(`
        *,
        enrollments(
          *,
          student:profiles!student_id(*),
          payment:payments(*)
        ),
        auditions(id, status),
        waitlist(count)
      `)
      .eq('teacher_id', user.id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false }),

    getActiveTier(user.id, supabase),

    // Dismissed debts (students the teacher has already resolved)
    supabase
      .from('dismissed_debts' as any)
      .select('student_id')
      .eq('teacher_id', user.id),

    // Ensayos que creé
    (supabase as any)
      .from('rehearsals')
      .select(`
        id, title, description, date_mode, rehearsal_date, rehearsal_time,
        custom_dates, coordinate_month, duration_minutes, status, created_at,
        invites:rehearsal_invites(
          id, user_id, status,
          user:profiles!user_id(id, username, full_name, avatar_url)
        )
      `)
      .eq('creator_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),

    // Ensayos a los que fui invitado (no rechazados)
    (supabase as any)
      .from('rehearsal_invites')
      .select(`
        id, status,
        rehearsal:rehearsals(
          id, title, date_mode, rehearsal_date, rehearsal_time,
          custom_dates, coordinate_month, duration_minutes,
          creator:profiles!creator_id(id, username, full_name, avatar_url)
        )
      `)
      .eq('user_id', user.id)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false }),
  ])

  const dismissedStudentIds = (dismissedDebts as any[] ?? []).map((d: any) => d.student_id)

  // Add deletion date to each teaching class
  const classesWithDeletion = (teachingClasses as any[] ?? []).map((cls) => ({
    ...cls,
    deletion_date: getClassDeletionDate(cls)?.toISOString() ?? null,
  }))

  return (
    <MyClassesClient
      enrollments={(enrollments as any[]) ?? []}
      teachingClasses={classesWithDeletion}
      defaultTab={canTeach(tier) ? 'teaching' : 'enrolled'}
      currentUserId={user.id}
      dismissedStudentIds={dismissedStudentIds}
      ownRehearsals={(ownRehearsals as any[]) ?? []}
      rehearsalInvites={(rehearsalInvites as any[]) ?? []}
    />
  )
}
