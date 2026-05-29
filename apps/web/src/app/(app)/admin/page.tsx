import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminReportsClient from '@/components/admin/AdminReportsClient'
import AdminStatsClient from '@/components/admin/AdminStatsClient'
import { Flag, BarChart2 } from 'lucide-react'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.SUPERADMIN_USER_ID) {
    redirect('/feed')
  }

  const admin = createAdminClient()
  const tab = searchParams.tab === 'stats' ? 'stats' : 'reports'

  // ── Reports tab data ───────────────────────────────────────────────────────
  const { data: rawReports } = await (admin as any)
    .from('reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  const reporterIds = [...new Set(((rawReports ?? []) as any[]).map((r: any) => r.reporter_id).filter(Boolean))]
  const { data: reporters } = reporterIds.length > 0
    ? await admin.from('profiles').select('id, username, full_name, avatar_url').in('id', reporterIds as string[])
    : { data: [] }
  const reporterMap = Object.fromEntries(((reporters as any[]) ?? []).map((p: any) => [p.id, p]))
  const reports = ((rawReports ?? []) as any[]).map((r: any) => ({ ...r, reporter: reporterMap[r.reporter_id] ?? null }))

  // ── Stats tab data ─────────────────────────────────────────────────────────
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: debtorsCount },
    { count: cancelledRecentCount },
    { data: allPendingReports },
  ] = await Promise.all([
    // Enrollments pending_payment older than 48h
    (admin as any)
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_payment')
      .lt('created_at', twoDaysAgo),
    // Classes cancelled in the last 14 days
    (admin as any)
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gte('updated_at', fourteenDaysAgo),
    // All pending reports for top-reported aggregation
    (admin as any)
      .from('reports')
      .select('content_type, content_id')
      .eq('status', 'pending'),
  ])

  // Aggregate top reported content client-side
  const countMap = new Map<string, { content_type: string; content_id: string; count: number }>()
  for (const r of (allPendingReports ?? []) as any[]) {
    const key = `${r.content_type}:${r.content_id}`
    const existing = countMap.get(key)
    if (existing) {
      existing.count++
    } else {
      countMap.set(key, { content_type: r.content_type, content_id: r.content_id, count: 1 })
    }
  }
  const topReported = [...countMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const stats = {
    debtorsCount: debtorsCount ?? 0,
    cancelledRecentCount: cancelledRecentCount ?? 0,
    topReported,
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-dark-border">
        <a
          href="/admin"
          className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'reports'
              ? 'border-brand-600 text-brand-600 dark:text-brand-300 dark:border-brand-300'
              : 'border-transparent text-gray-500 dark:text-dark-text2 hover:text-gray-700'
          }`}
        >
          <Flag className="h-4 w-4" />
          Reportes
          {reports.length > 0 && (
            <span className="badge bg-coral-fuego/15 text-coral-fuego">{reports.length}</span>
          )}
        </a>
        <a
          href="/admin?tab=stats"
          className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'stats'
              ? 'border-brand-600 text-brand-600 dark:text-brand-300 dark:border-brand-300'
              : 'border-transparent text-gray-500 dark:text-dark-text2 hover:text-gray-700'
          }`}
        >
          <BarChart2 className="h-4 w-4" />
          Estadísticas
        </a>
      </div>

      {tab === 'reports' && <AdminReportsClient reports={reports} />}
      {tab === 'stats' && <AdminStatsClient stats={stats} />}
    </div>
  )
}
