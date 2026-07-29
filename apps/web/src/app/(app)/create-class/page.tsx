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

  const [{ data: paymentInfo }, { count: sueltas_this_month }, { data: profile }] = await Promise.all([
    supabase.from('teacher_payment_info').select('*').eq('teacher_id', user.id).maybeSingle(),
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', user.id)
      .eq('type', 'suelta')
      .gte('created_at', monthStart),
    supabase.from('profiles').select('mp_connected').eq('id', user.id).maybeSingle(),
  ])

  return (
    <CreateClassForm
      teacherId={user.id}
      hasPaymentInfo={!!paymentInfo}
      mpConnected={!!(profile as any)?.mp_connected}
      tier={tier}
      sueltas_this_month={sueltas_this_month ?? 0}
    />
  )
}
