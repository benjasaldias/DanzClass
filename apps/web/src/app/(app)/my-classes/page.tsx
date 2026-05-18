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

  const [{ data: enrollments }, { data: teachingClasses }, tier, { data: dismissedDebts }] = await Promise.all([
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
        ),
        auditions(id, status)
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
    />
  )
}
