import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDebtSummary } from '@/lib/monthlyCharges'
import { getActiveTier } from '@/lib/subscription'
import PaymentClient from '@/components/payment/PaymentClient'
import type { EnrollmentWithDetails } from '@danceclass/shared'

interface Props {
  params: { enrollmentId: string }
}

export default async function PaymentPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: rawEnrollment } = await supabase
    .from('enrollments')
    .select(`
      *,
      class:classes(
        *,
        teacher:profiles!teacher_id(
          *,
          payment_info:teacher_payment_info(*)
        )
      ),
      payment:payments(*)
    `)
    .eq('id', params.enrollmentId)
    .eq('student_id', user.id)
    .single()

  if (!rawEnrollment) notFound()

  const enrollment = rawEnrollment as unknown as EnrollmentWithDetails
  const isTraining = (enrollment as any).class?.type === 'entrenamiento'

  // Confirmado y nada que pagar → a la clase. En un ENTRENAMIENTO no aplica: la
  // inscripción está confirmada de forma permanente y el alumno vuelve a esta
  // pantalla todos los meses a pagar su mensualidad (audit.md S4). Redirigirlo
  // acá lo dejaría sin ninguna forma de ponerse al día.
  if (!isTraining && enrollment.status === 'confirmed') {
    redirect(`/class/${enrollment.class_id}`)
  }

  // Deuda mensual acumulada. `getDebtSummary` emite de paso los cargos que
  // falten, para que el alumno que entra el mismo día del cobro (antes de que
  // corra el cron) vea el mes en curso y no una pantalla vacía.
  const debt = isTraining
    ? await getDebtSummary(createAdminClient(), enrollment.id, (enrollment as any).class?.billing_day ?? 1)
    : null

  // If 2x enrollment, fetch the related request to determine who pays
  const { data: twoxRequest } = (rawEnrollment as any).is_2x
    ? await (supabase as any)
        .from('class_2x_requests')
        .select('*')
        .eq('class_id', rawEnrollment.class_id)
        .or(`user_id.eq.${user.id},matched_with.eq.${user.id}`)
        .eq('status', 'matched')
        .maybeSingle()
    : { data: null }

  const tier = await getActiveTier(user.id, supabase)
  const teacherMpConnected = !!(enrollment as any).class?.teacher?.mp_connected

  return (
    <PaymentClient
      enrollment={enrollment}
      currentUserId={user.id}
      twoxRequest={twoxRequest}
      tier={tier}
      teacherMpConnected={teacherMpConnected}
      debt={debt}
    />
  )
}
