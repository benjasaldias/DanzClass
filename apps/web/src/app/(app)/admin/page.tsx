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

  const { data: rawReports } = await (admin as any)
    .from('reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch reporter profiles separately (reporter_id FKs to auth.users, not profiles)
  const reporterIds = [...new Set(((rawReports ?? []) as any[]).map((r: any) => r.reporter_id).filter(Boolean))]
  const { data: reporters } = reporterIds.length > 0
    ? await admin.from('profiles').select('id, username, full_name, avatar_url').in('id', reporterIds as string[])
    : { data: [] }
  const reporterMap = Object.fromEntries(((reporters as any[]) ?? []).map((p: any) => [p.id, p]))
  const reports = ((rawReports ?? []) as any[]).map((r: any) => ({ ...r, reporter: reporterMap[r.reporter_id] ?? null }))

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-coral-fuego" />
          <h1 className="text-lg font-bold text-gray-900">Reportes pendientes</h1>
          {(reports ?? []).length > 0 && (
            <span className="ml-auto badge bg-coral-fuego/15 text-coral-fuego">
              {(reports ?? []).length}
            </span>
          )}
        </div>
      </div>
      <AdminReportsClient reports={reports ?? []} />
    </div>
  )
}
