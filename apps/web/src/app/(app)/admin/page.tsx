import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminReportsClient from '@/components/admin/AdminReportsClient'
import { Flag } from 'lucide-react'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    redirect('/feed')
  }

  const admin = createAdminClient()

  const { data: reports } = await (admin as any)
    .from('reports')
    .select('*, reporter:profiles!reporter_id(id, username, full_name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-bold text-gray-900">Reportes pendientes</h1>
          {(reports ?? []).length > 0 && (
            <span className="ml-auto badge bg-orange-100 text-orange-700">
              {(reports ?? []).length}
            </span>
          )}
        </div>
      </div>
      <AdminReportsClient reports={reports ?? []} />
    </div>
  )
}
