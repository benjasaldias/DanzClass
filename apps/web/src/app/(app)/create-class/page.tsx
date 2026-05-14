import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import CreateClassForm from '@/components/class/CreateClassForm'

export default async function CreateClassPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/plans')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: paymentInfo }, { count: sueltas_this_month }] = await Promise.all([
    supabase.from('teacher_payment_info').select('*').eq('teacher_id', user.id).maybeSingle(),
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', user.id)
      .eq('type', 'suelta')
      .gte('created_at', monthStart),
  ])

  return (
    <CreateClassForm
      teacherId={user.id}
      hasPaymentInfo={!!paymentInfo}
      tier={tier}
      sueltas_this_month={sueltas_this_month ?? 0}
    />
  )
}
