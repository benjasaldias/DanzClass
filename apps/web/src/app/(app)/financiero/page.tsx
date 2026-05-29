import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import FinancialDashboardClient from '@/components/class/FinancialDashboardClient'

export default async function FinancieroDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/plans')

  // Fetch all confirmed payments for this teacher's classes
  const { data: payments } = await (supabase as any)
    .from('payments')
    .select(`
      id, amount, status, created_at,
      enrollment:enrollments!inner(
        id, student_id, class_id, status,
        student:profiles!student_id(id, full_name, username, avatar_url),
        class:classes!inner(id, title, dance_style, type, teacher_id)
      )
    `)
    .eq('enrollment.class.teacher_id', user.id)
    .eq('status', 'verified')
    .order('created_at', { ascending: false })

  // Fetch all active classes for this teacher
  const { data: classes } = await (supabase as any)
    .from('classes')
    .select(`
      id, title, dance_style, type, price, price_monthly, max_spots,
      enrollments(id, status, student_id)
    `)
    .eq('teacher_id', user.id)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })

  return (
    <FinancialDashboardClient
      payments={payments ?? []}
      classes={classes ?? []}
    />
  )
}
