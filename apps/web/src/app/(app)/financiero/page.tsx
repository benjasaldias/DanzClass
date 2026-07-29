import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import FinancialDashboardClient from '@/components/class/FinancialDashboardClient'

export default async function FinancieroDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) redirect('/plans')

  // P2-2: agregados calculados en SQL (RPC) — evita traer todos los pagos a JS.
  const { data: summary } = await (supabase as any).rpc('teacher_financial_summary')

  // Detalle acotado a los últimos 6 meses (para la lista + filtro por mes que la
  // UI ofrece). Antes se traían TODOS los pagos verified sin límite.
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data: recentPayments } = await (supabase as any)
    .from('payments')
    .select(`
      id, amount, verified_at, submitted_at, billing_period, offline_confirmed,
      enrollment:enrollments!inner(
        student_id,
        student:profiles!student_id(id, full_name, username, avatar_url),
        class:classes!inner(id, title, teacher_id)
      )
    `)
    .eq('enrollment.class.teacher_id', user.id)
    .eq('status', 'verified')
    .gte('verified_at', sixMonthsAgo.toISOString())
    .order('verified_at', { ascending: false })
    .limit(300)

  return (
    <FinancialDashboardClient
      summary={summary ?? {}}
      recentPayments={recentPayments ?? []}
    />
  )
}
