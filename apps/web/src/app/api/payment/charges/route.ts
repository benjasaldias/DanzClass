import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDebtSummary } from '@/lib/monthlyCharges'

// GET /api/payment/charges?enrollmentId=<id>
//
// Deuda mensual acumulada de una inscripción de entrenamiento (audit.md S4).
// Existe para mobile: en web la calcula el server component de la pantalla de
// pago, pero mobile lee de Supabase directo y no puede EMITIR los cargos que
// falten (`generate_monthly_charges` es service role). Sin esta ruta, un alumno
// que abre la app el día del cobro —antes de que corra el cron— vería su deuda
// desactualizada.
//
// Sólo devuelve la deuda de la propia inscripción del alumno o de una clase del
// profesor: no acepta consultar la de un tercero.
export async function GET(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  const enrollmentId = new URL(request.url).searchParams.get('enrollmentId')
  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId_required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: enrollment } = await (admin as any)
    .from('enrollments')
    .select('id, student_id, class:classes(id, type, teacher_id, billing_day)')
    .eq('id', enrollmentId)
    .maybeSingle()

  if (!enrollment) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const cls = enrollment.class
  if (enrollment.student_id !== userId && cls?.teacher_id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (cls?.type !== 'entrenamiento') {
    return NextResponse.json({ debt: null })
  }

  const debt = await getDebtSummary(admin, enrollmentId, cls.billing_day ?? 1)
  return NextResponse.json({ debt })
}
