import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditClassForm from '@/components/class/EditClassForm'

interface Props {
  params: { id: string }
}

export default async function EditClassPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: classData } = await supabase
    .from('classes')
    .select('*, media:class_media(*)')
    .eq('id', params.id)
    .single()

  if (!classData) notFound()

  // Only the teacher of this class can edit it
  if (classData.teacher_id !== user.id) redirect(`/class/${params.id}`)

  return <EditClassForm classData={classData} />
}
