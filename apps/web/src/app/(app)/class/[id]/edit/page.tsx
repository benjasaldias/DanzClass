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

  return <EditClassForm classData={classData} />
}
