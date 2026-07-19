import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminReportsClient from '@/components/admin/AdminReportsClient'
import AdminStatsClient from '@/components/admin/AdminStatsClient'
import AdminSettingsClient from '@/components/admin/AdminSettingsClient'
import AdminReconciliationClient, { type ReconciliationData } from '@/components/admin/AdminReconciliationClient'
import { Flag, BarChart2, Settings, Wallet } from 'lucide-react'

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
  const tab = searchParams.tab === 'stats' ? 'stats'
    : searchParams.tab === 'settings' ? 'settings'
    : searchParams.tab === 'reconciliation' ? 'reconciliation'
    : 'reports'

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

  // ── Settings tab data ──────────────────────────────────────────────────────
  const { data: autoConfirmSetting } = await (admin as any)
    .from('app_settings')
    .select('value')
    .eq('key', 'auto_confirm_enabled')
    .maybeSingle()
  const autoConfirmEnabled = autoConfirmSetting?.value === true

  // ── Reconciliation tab data (pagos in-app MP con split confirmados) ──────────
  const { data: mpPayments } = await (admin as any)
    .from('payments')
    .select('amount, commission_amount, confirmed_at, verified_at, recipient_teacher_id')
    .eq('payment_method', 'mp')
    .eq('status', 'verified')

  const mpRows = (mpPayments ?? []) as any[]
  let totalCommission = 0
  let totalBase = 0
  const monthMap = new Map<string, { commission: number; base: number; count: number }>()
  const teacherMap = new Map<string, { base: number; commission: number; count: number }>()

  for (const p of mpRows) {
    const commission = p.commission_amount ?? 0
    const base = p.amount ?? 0
    totalCommission += commission
    totalBase += base

    const when: string | null = p.confirmed_at ?? p.verified_at
    const monthKey = when ? String(when).slice(0, 7) : 'sin fecha'
    const mm = monthMap.get(monthKey) ?? { commission: 0, base: 0, count: 0 }
    mm.commission += commission; mm.base += base; mm.count++
    monthMap.set(monthKey, mm)

    if (p.recipient_teacher_id) {
      const tt = teacherMap.get(p.recipient_teacher_id) ?? { base: 0, commission: 0, count: 0 }
      tt.base += base; tt.commission += commission; tt.count++
      teacherMap.set(p.recipient_teacher_id, tt)
    }
  }

  const teacherIds = [...teacherMap.keys()]
  const { data: teacherProfiles } = teacherIds.length > 0
    ? await admin.from('profiles').select('id, username, full_name').in('id', teacherIds)
    : { data: [] }
  const teacherNameMap = Object.fromEntries(
    ((teacherProfiles as any[]) ?? []).map((p: any) => [p.id, p.full_name || p.username || p.id])
  )

  const reconciliation: ReconciliationData = {
    totalCommission,
    totalBase,
    totalGross: totalCommission + totalBase,
    count: mpRows.length,
    byMonth: [...monthMap.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => (a.month < b.month ? 1 : -1)),
    byTeacher: [...teacherMap.entries()]
      .map(([teacherId, v]) => ({ teacherId, name: teacherNameMap[teacherId] ?? teacherId, ...v }))
      .sort((a, b) => b.commission - a.commission),
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
        <a
          href="/admin?tab=settings"
          className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'settings'
              ? 'border-brand-600 text-brand-600 dark:text-brand-300 dark:border-brand-300'
              : 'border-transparent text-gray-500 dark:text-dark-text2 hover:text-gray-700'
          }`}
        >
          <Settings className="h-4 w-4" />
          Ajustes
        </a>
        <a
          href="/admin?tab=reconciliation"
          className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'reconciliation'
              ? 'border-brand-600 text-brand-600 dark:text-brand-300 dark:border-brand-300'
              : 'border-transparent text-gray-500 dark:text-dark-text2 hover:text-gray-700'
          }`}
        >
          <Wallet className="h-4 w-4" />
          Conciliación
        </a>
      </div>

      {tab === 'reports' && <AdminReportsClient reports={reports} />}
      {tab === 'stats' && <AdminStatsClient stats={stats} />}
      {tab === 'settings' && <AdminSettingsClient initialAutoConfirmEnabled={autoConfirmEnabled} />}
      {tab === 'reconciliation' && <AdminReconciliationClient data={reconciliation} />}
    </div>
  )
}
