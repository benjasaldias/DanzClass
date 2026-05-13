import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NotificationsClient from '@/components/notifications/NotificationsClient'

export default async function NotificationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  type NotifRow = { data: Record<string, string> | null }
  const notifs = notifications as NotifRow[] | null
  // Collect IDs needed to enrich notification display
  const fromUserIds = [...new Set(
    (notifs ?? []).filter(n => n.data?.from_user_id).map(n => n.data!.from_user_id)
  )]
  const classIds = [...new Set(
    (notifs ?? []).filter(n => n.data?.class_id).map(n => n.data!.class_id)
  )]

  const [profilesResult, classesResult] = await Promise.all([
    fromUserIds.length > 0
      ? supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', fromUserIds)
      : Promise.resolve({ data: [] as any[] }),
    classIds.length > 0
      ? supabase.from('classes').select('id, title').in('id', classIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileMap = Object.fromEntries((profilesResult.data ?? []).map((p) => [p.id, p]))
  const classMap = Object.fromEntries((classesResult.data ?? []).map((c) => [c.id, c]))

  return (
    <div className="flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
      </div>
      <NotificationsClient
        notifications={notifications ?? []}
        profileMap={profileMap}
        classMap={classMap}
        userId={user.id}
      />
    </div>
  )
}
