import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuditionsListClient from '@/components/class/AuditionsListClient'

export default async function AuditionsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: cls } = await supabase
    .from('classes' as any)
    .select('id, title, teacher_id, type, audition_closed')
    .eq('id', params.id)
    .single()

  if (!cls || (cls as any).teacher_id !== user.id) redirect(`/class/${params.id}`)
  if ((cls as any).type !== 'entrenamiento') redirect(`/class/${params.id}`)

  const { data: auditions } = await (supabase as any)
    .from('auditions')
    .select('*, applicant:profiles!applicant_id(username, full_name, avatar_url)')
    .eq('class_id', params.id)
    .order('created_at', { ascending: false })

  return (
    <AuditionsListClient
      classId={params.id}
      classTitle={(cls as any).title}
      auditions={(auditions as any[]) ?? []}
      auditionClosed={(cls as any).audition_closed ?? false}
    />
  )
}
