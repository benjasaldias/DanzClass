import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import MyClassesClient from '@/components/class/MyClassesClient'
import { getActiveTier } from '@/lib/subscription'
// getClassDeletionDate vive en `packages/shared` (D-5) — antes había una copia
// acá y otra (`lastSessionEnd`) en el cron de limpieza, con la misma regla
// escrita dos veces.
import { canTeach, getClassDeletionDate } from '@danceclass/shared'

export default async function MyClassesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

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
      .in('status', ['active', 'completed', 'archived'])
      .order('created_at', { ascending: false }),

    getActiveTier(user.id, supabase),

    // Dismissed debts (students the teacher has already resolved)
    supabase
      .from('dismissed_debts' as any)
      .select('student_id')
      .eq('teacher_id', user.id),

    // Ensayos que creé — admin client bypasses RLS
    (admin as any)
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

    // Ensayos a los que fui invitado (no rechazados) — admin client bypasses RLS
    (admin as any)
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

  // Asistencia registrada por QR (item 2). RLS devuelve solo las filas que el
  // usuario puede ver: su propia asistencia (alumno) + la de sus clases (profe).
  // Se agrupa por `${class_id}:${student_id}` → fechas de sesión asistidas, para
  // marcar "asistencia confirmada" en el historial.
  const { data: attendanceRows } = await (supabase as any)
    .from('attendance')
    .select('class_id, student_id, session_date')

  const attendanceMap: Record<string, string[]> = {}
  for (const a of (attendanceRows as any[] ?? [])) {
    if (!a.class_id || !a.student_id) continue
    const key = `${a.class_id}:${a.student_id}`
    ;(attendanceMap[key] ??= []).push(a.session_date)
  }
  for (const k in attendanceMap) attendanceMap[k].sort()

  return (
    <MyClassesClient
      enrollments={(enrollments as any[]) ?? []}
      teachingClasses={classesWithDeletion}
      defaultTab={canTeach(tier) ? 'teaching' : 'enrolled'}
      currentUserId={user.id}
      dismissedStudentIds={dismissedStudentIds}
      ownRehearsals={(ownRehearsals as any[]) ?? []}
      rehearsalInvites={(rehearsalInvites as any[]) ?? []}
      attendance={attendanceMap}
    />
  )
}
