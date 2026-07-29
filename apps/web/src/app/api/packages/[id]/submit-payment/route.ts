import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/packages/[id]/submit-payment — student uploads receipt for package payment
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const admin = createAdminClient()
  const packageId = params.id
  const { package_enrollment_id, receipt_path } = await request.json() as {
    package_enrollment_id: string
    receipt_path: string
  }

  if (!package_enrollment_id || !receipt_path) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  // Mismo prefijo que exige la policy de INSERT del bucket `payment-receipts`
  // (migración 007). Sin esta validación, el cliente podía registrar como
  // comprobante propio el path de cualquier otro archivo del bucket.
  if (!receipt_path.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: 'invalid_receipt_path' }, { status: 400 })
  }

  // Verify enrollment belongs to this student
  const { data: enrollment } = await (admin as any)
    .from('package_enrollments')
    .select('id, student_id, package_id, status')
    .eq('id', package_enrollment_id)
    .eq('package_id', packageId)
    .eq('student_id', auth.user.id)
    .single()

  if (!enrollment) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (enrollment.status === 'confirmed') {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 400 })
  }

  await (admin as any)
    .from('package_enrollments')
    .update({ receipt_url: receipt_path, status: 'payment_submitted' })
    .eq('id', package_enrollment_id)

  // Update individual class enrollments to payment_submitted as well
  const { data: pkg } = await (admin as any)
    .from('class_packages')
    .select('items:class_package_items(class_id)')
    .eq('id', packageId)
    .single()

  if (pkg?.items?.length) {
    const classIds = pkg.items.map((i: any) => i.class_id)
    await (admin as any)
      .from('enrollments')
      .update({ status: 'payment_submitted' })
      .in('class_id', classIds)
      .eq('student_id', auth.user.id)
      .eq('status', 'pending_payment')
  }

  return NextResponse.json({ ok: true })
}
