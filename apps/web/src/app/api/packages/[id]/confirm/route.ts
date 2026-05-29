import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNotifications } from '@/lib/notifications'

// POST /api/packages/[id]/confirm — teacher confirms a student's package payment
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const packageId = params.id
  const { package_enrollment_id, action } = await request.json() as {
    package_enrollment_id: string
    action: 'confirm' | 'reject'
  }

  // Verify teacher owns this package
  const { data: pkg } = await (admin as any)
    .from('class_packages')
    .select('id, teacher_id, items:class_package_items(class_id)')
    .eq('id', packageId)
    .single()

  if (!pkg || pkg.teacher_id !== auth.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: pkgEnrollment } = await (admin as any)
    .from('package_enrollments')
    .select('id, student_id, status')
    .eq('id', package_enrollment_id)
    .eq('package_id', packageId)
    .single()

  if (!pkgEnrollment) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const classIds: string[] = (pkg.items ?? []).map((i: any) => i.class_id)

  if (action === 'confirm') {
    // Update package enrollment
    await (admin as any)
      .from('package_enrollments')
      .update({ status: 'confirmed' })
      .eq('id', package_enrollment_id)

    // Confirm all individual class enrollments
    await (admin as any)
      .from('enrollments')
      .update({ status: 'confirmed' })
      .in('class_id', classIds)
      .eq('student_id', pkgEnrollment.student_id)
      .eq('status', 'payment_submitted')

    // Notify student (use first class_id as reference for the notification)
    if (classIds[0]) {
      await sendNotifications([{
        user_id: pkgEnrollment.student_id,
        type: 'payment_confirmed',
        data: { class_id: classIds[0], package_id: packageId },
      }])
    }
  } else {
    await (admin as any)
      .from('package_enrollments')
      .update({ status: 'pending_payment' })
      .eq('id', package_enrollment_id)

    // Reject all class payments (keep enrollments pending)
    if (classIds[0]) {
      await sendNotifications([{
        user_id: pkgEnrollment.student_id,
        type: 'payment_rejected',
        data: { class_id: classIds[0], package_id: packageId },
      }])
    }
  }

  return NextResponse.json({ ok: true })
}
