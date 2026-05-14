import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublishChoiceClient from '@/components/publish/PublishChoiceClient'

export default async function PublishPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('city')
    .eq('id', user.id)
    .single()

  return (
    <PublishChoiceClient
      userId={user.id}
      userCity={profile?.city ?? null}
    />
  )
}
