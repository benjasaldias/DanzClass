import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import RehearsalDetailClient from './RehearsalDetailClient'

interface Props {
  params: { id: string }
}

export default async function RehearsalDetailPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // RLS ensures only creator/invitees can see this
  const { data: rehearsal } = await (supabase as any)
    .from('rehearsals')
    .select(`
      *,
      creator:profiles!creator_id(id, username, full_name, avatar_url),
      invites:rehearsal_invites(
        id, user_id, status,
        user:profiles!user_id(id, username, full_name, avatar_url)
      )
    `)
    .eq('id', params.id)
    .eq('status', 'active')
    .single()

  if (!rehearsal) notFound()

  const myInvite = (rehearsal.invites ?? []).find((i: any) => i.user_id === user.id) ?? null
  const rehearsalWithInvite = { ...rehearsal, my_invite: myInvite }

  return (
    <RehearsalDetailClient
      rehearsal={rehearsalWithInvite}
      currentUserId={user.id}
    />
  )
}
