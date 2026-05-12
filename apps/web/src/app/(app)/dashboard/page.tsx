import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import DashboardClient from '@/components/class/DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/plans')

  const { data: classes } = await supabase
    .from('classes')
    .select(`
      *,
      media:class_media(*),
      enrollments(
        *,
        student:profiles!student_id(*),
        payment:payments(*)
      )
    `)
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false })

  return <DashboardClient classes={classes ?? []} />
}
