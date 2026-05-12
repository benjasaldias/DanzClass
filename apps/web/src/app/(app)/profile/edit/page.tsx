import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditProfileForm from '@/components/profile/EditProfileForm'

export default async function EditProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/feed')

  return <EditProfileForm profile={profile} />
}
