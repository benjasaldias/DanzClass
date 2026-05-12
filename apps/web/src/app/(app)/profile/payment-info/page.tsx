import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import PaymentInfoForm from '@/components/profile/PaymentInfoForm'

export default async function PaymentInfoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/profile')

  const { data: paymentInfo } = await supabase
    .from('teacher_payment_info')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  return <PaymentInfoForm teacherId={user.id} existingInfo={paymentInfo} />
}
