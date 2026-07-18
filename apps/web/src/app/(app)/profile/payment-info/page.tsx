import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import PaymentInfoForm from '@/components/profile/PaymentInfoForm'
import MpConnectCard from '@/components/profile/MpConnectCard'

export default async function PaymentInfoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/profile')

  const [{ data: paymentInfo }, { data: profile }] = await Promise.all([
    supabase.from('teacher_payment_info').select('*').eq('teacher_id', user.id).maybeSingle(),
    (supabase as any).from('profiles').select('mp_connected').eq('id', user.id).maybeSingle(),
  ])

  return (
    <>
      <div className="px-4 pt-4">
        <Suspense fallback={null}>
          <MpConnectCard connected={!!profile?.mp_connected} />
        </Suspense>
      </div>
      <PaymentInfoForm teacherId={user.id} existingInfo={paymentInfo} />
    </>
  )
}
