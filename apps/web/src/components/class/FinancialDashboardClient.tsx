'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Users, BookOpen, DollarSign, ArrowLeft, ChevronDown } from 'lucide-react'
import { cn, formatCLP } from '@/lib/utils'
import Avatar from '@/components/ui/Avatar'

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(key: string) {
  const [year, month] = key.split('-')
  return `${MONTHS_ES[Number(month) - 1]} ${year}`
}

function getLast6MonthKeys() {
  const keys: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-dark-text2">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-dark-text leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-dark-text2">{sub}</p>}
      </div>
    </div>
  )
}

export default function FinancialDashboardClient({ payments, classes }: { payments: any[]; classes: any[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const last6 = getLast6MonthKeys()
  const currentMonthKey = last6[5]

  const filteredPayments = useMemo(() => {
    if (selectedMonth === 'all') return payments
    return payments.filter((p) => getMonthKey(p.created_at) === selectedMonth)
  }, [payments, selectedMonth])

  // Global stats (all time)
  const totalIncome = payments.reduce((acc, p) => acc + (p.amount ?? 0), 0)
  const uniqueStudentsAllTime = new Set(payments.map((p) => p.enrollment?.student_id)).size

  // Monthly stats for selected filter
  const filteredIncome = filteredPayments.reduce((acc, p) => acc + (p.amount ?? 0), 0)
  const filteredUniqueStudents = new Set(filteredPayments.map((p) => p.enrollment?.student_id)).size

  // Last 6 months income trend
  const monthlyTrend = last6.map((key) => {
    const total = payments
      .filter((p) => getMonthKey(p.created_at) === key)
      .reduce((acc, p) => acc + (p.amount ?? 0), 0)
    return { key, label: getMonthLabel(key), total }
  })
  const maxMonthly = Math.max(...monthlyTrend.map((m) => m.total), 1)

  // Top classes by income (all time)
  const classIncomeMap: Record<string, { title: string; style: string; income: number; confirmed: number }> = {}
  for (const p of payments) {
    const cls = p.enrollment?.class
    if (!cls) continue
    if (!classIncomeMap[cls.id]) {
      classIncomeMap[cls.id] = { title: cls.title, style: cls.dance_style ?? '', income: 0, confirmed: 0 }
    }
    classIncomeMap[cls.id].income += p.amount ?? 0
    classIncomeMap[cls.id].confirmed++
  }
  const topClasses = Object.entries(classIncomeMap)
    .sort((a, b) => b[1].income - a[1].income)
    .slice(0, 5)

  // Active classes stats
  const activeCount = classes.filter((c) => c.status === 'active' || !c.status).length
  const totalEnrolled = classes.reduce((acc, c) => {
    const active = (c.enrollments ?? []).filter((e: any) => e.status !== 'cancelled').length
    return acc + active
  }, 0)
  const totalConfirmed = classes.reduce((acc, c) => {
    const confirmed = (c.enrollments ?? []).filter((e: any) => e.status === 'confirmed').length
    return acc + confirmed
  }, 0)
  const conversionRate = totalEnrolled > 0 ? Math.round((totalConfirmed / totalEnrolled) * 100) : 0

  // Recent payments in filtered view
  const recentPayments = filteredPayments.slice(0, 10)

  return (
    <div className="px-4 py-4 pb-24 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/profile" className="flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-surface transition-colors">
          <ArrowLeft className="h-4 w-4 text-gray-600 dark:text-dark-text2" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Panel Financiero</h1>
          <p className="text-xs text-gray-500 dark:text-dark-text2">Resumen de ingresos y actividad</p>
        </div>
      </div>

      {/* Global stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          label="Ingresos totales"
          value={formatCLP(totalIncome)}
          color="bg-emerald-50 dark:bg-emerald-900/20"
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          label="Alumnos únicos"
          value={String(uniqueStudentsAllTime)}
          sub="con pago confirmado"
          color="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          icon={<BookOpen className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          label="Clases activas"
          value={String(activeCount)}
          sub={`${totalEnrolled} inscripciones`}
          color="bg-violet-50 dark:bg-violet-900/20"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-brand-600 dark:text-brand-300" />}
          label="Tasa de pago"
          value={`${conversionRate}%`}
          sub="inscritos con pago"
          color="bg-brand-50 dark:bg-brand-950/30"
        />
      </div>

      {/* Monthly trend chart */}
      <div className="card p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-4">Ingresos últimos 6 meses</h2>
        <div className="flex items-end gap-2 h-28">
          {monthlyTrend.map((m) => {
            const heightPct = maxMonthly > 0 ? (m.total / maxMonthly) * 100 : 0
            const isCurrentMonth = m.key === currentMonthKey
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 dark:text-dark-text2 font-medium">
                  {m.total > 0 ? formatCLP(m.total).replace('$ ', '$').replace(',00', '') : ''}
                </span>
                <div className="w-full relative flex items-end" style={{ height: 72 }}>
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all',
                      isCurrentMonth
                        ? 'bg-violet-500 dark:bg-violet-400'
                        : 'bg-gray-200 dark:bg-dark-border'
                    )}
                    style={{ height: `${Math.max(heightPct, m.total > 0 ? 8 : 2)}%` }}
                  />
                </div>
                <span className={cn(
                  'text-[10px] font-medium',
                  isCurrentMonth ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-dark-text2'
                )}>
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Month filter */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Detalle de pagos</h2>
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="appearance-none rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-1.5 pr-7 text-xs font-medium text-gray-700 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="all">Todo el tiempo</option>
            {last6.map((key) => (
              <option key={key} value={key}>{getMonthLabel(key)}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
        </div>
      </div>

      {/* Filtered stats row */}
      {selectedMonth !== 'all' && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-dark-text2">Ingresos</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(filteredIncome)}</p>
          </div>
          <div className="flex-1 rounded-xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-dark-text2">Alumnos únicos</p>
            <p className="text-sm font-bold text-gray-900 dark:text-dark-text">{filteredUniqueStudents}</p>
          </div>
          <div className="flex-1 rounded-xl border border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-dark-text2">Pagos</p>
            <p className="text-sm font-bold text-gray-900 dark:text-dark-text">{filteredPayments.length}</p>
          </div>
        </div>
      )}

      {/* Recent payments */}
      {recentPayments.length > 0 ? (
        <div className="space-y-2 mb-5">
          {recentPayments.map((p) => {
            const student = p.enrollment?.student
            const cls = p.enrollment?.class
            const date = new Date(p.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
            return (
              <div key={p.id} className="card p-3 flex items-center gap-3">
                <Avatar src={student?.avatar_url} name={student?.full_name ?? '?'} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-dark-text truncate">{student?.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text2 truncate">{cls?.title}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(p.amount)}</p>
                  <p className="text-[10px] text-gray-400 dark:text-dark-text2">{date}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-10 text-gray-400 dark:text-dark-text2 text-sm">
          Sin pagos {selectedMonth !== 'all' ? 'en este período' : 'registrados aún'}
        </div>
      )}

      {/* Top classes */}
      {topClasses.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3">Top clases por ingreso</h2>
          <div className="space-y-3">
            {topClasses.map(([id, data], i) => (
              <div key={id} className="flex items-center gap-3">
                <span className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  i === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : i === 1 ? 'bg-gray-200 dark:bg-dark-surface2 text-gray-600 dark:text-dark-text2'
                    : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                )}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">{data.title}</p>
                  {data.style && <p className="text-xs text-gray-500 dark:text-dark-text2">{data.style}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCLP(data.income)}</p>
                  <p className="text-[10px] text-gray-400 dark:text-dark-text2">{data.confirmed} pagos</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
