import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditClassForm from '@/components/class/EditClassForm'
import type { Class, ClassMedia } from '@danceclass/shared'

interface Props {
  params: { id: string }
}

export default async function EditClassPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: rawClass } = await supabase
    .from('classes')
    .select('*, media:class_media(*)')
    .eq('id', params.id)
    .single()

  if (!rawClass) notFound()

  const classData = rawClass as unknown as Class & { media: ClassMedia[] }

  // Only the teacher of this class can edit it
  if (classData.teacher_id !== user.id) redirect(`/class/${params.id}`)

  const [{ data: paymentInfo }, { data: profile }] = await Promise.all([
    supabase.from('teacher_payment_info').select('teacher_id').eq('teacher_id', user.id).maybeSingle(),
    supabase.from('profiles').select('mp_connected').eq('id', user.id).maybeSingle(),
  ])

  return (
    <EditClassForm
      classData={classData}
      hasPaymentInfo={!!paymentInfo}
      mpConnected={!!(profile as any)?.mp_connected}
    />
  )
}
