import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScanAttendanceClient from '@/components/class/ScanAttendanceClient'

export default async function ScanAttendancePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: cls } = await supabase
    .from('classes' as any)
    .select('id, title, teacher_id')
    .eq('id', params.id)
    .single()

  if (!cls || (cls as any).teacher_id !== user.id) redirect(`/class/${params.id}`)

  return <ScanAttendanceClient classId={params.id} classTitle={(cls as any).title} />
}
