import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BookOpen, ChevronRight, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import Avatar from '@/components/ui/Avatar'

const STATUS_DISPLAY = {
  pending_payment: { label: 'Pendiente de pago', icon: AlertCircle, color: 'text-gray-500 bg-gray-50 border-gray-200' },
  payment_submitted: { label: 'Verificando pago', icon: Clock, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, color: 'text-green-700 bg-green-50 border-green-200' },
  cancelled: { label: 'Cancelado', icon: AlertCircle, color: 'text-red-600 bg-red-50 border-red-200' },
}

export default async function MyClassesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      *,
      class:classes(
        *,
        teacher:profiles!teacher_id(*),
        media:class_media(*)
      ),
      payment:payments(*)
    `)
    .eq('student_id', user.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Mis clases</h1>

      {!enrollments || enrollments.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
            <BookOpen className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="font-semibold text-gray-900">Sin clases inscritas</h3>
          <p className="text-sm text-gray-500 mt-1">Explora el feed para encontrar clases</p>
          <Link href="/feed" className="mt-4 btn-primary">
            Ver clases
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {enrollments.map((enrollment) => {
            const cls = enrollment.class as any
            const teacher = cls?.teacher
            const config = STATUS_DISPLAY[enrollment.status as keyof typeof STATUS_DISPLAY]
            if (!config) return null
            const Icon = config.icon
            const schedule = cls?.type === 'suelta'
              ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
              : `${DAYS_OF_WEEK[cls?.day_of_week]} · ${formatTime(cls?.recurring_time)}`

            return (
              <Link key={enrollment.id} href={`/class/${cls?.id}`} className="card p-4 flex gap-3 hover:shadow-md transition-shadow">
                <Avatar src={teacher?.avatar_url} name={teacher?.full_name ?? '?'} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{cls?.title}</p>
                  <p className="text-xs text-gray-500">{teacher?.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{schedule}</p>
                  <div className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', config.color)}>
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </div>
                  {enrollment.status === 'pending_payment' && (
                    <p className="mt-1 text-xs text-brand-600 font-medium">
                      {formatCLP(cls?.price)} — Haz clic para pagar
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 self-center" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
