import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { canEnroll } from '@danceclass/shared'
import { getActiveTier } from '@/lib/subscription'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'

// POST /api/packages/[id]/enroll — student enrolls in a package
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const rlHit = await checkRateLimit(`enroll:${auth.user.id}`, 'enroll')
  if (rlHit) return rlHit

  const supabase = createClient()
  const tier = await getActiveTier(auth.user.id, supabase)
  if (!canEnroll(tier)) {
    return NextResponse.json({ error: 'requires_plan' }, { status: 403 })
  }

  const admin = createAdminClient()
  const packageId = params.id

  // Fetch package with items
  const { data: pkg } = await (admin as any)
    .from('class_packages')
    .select(`
      id, teacher_id, price, status,
      items:class_package_items(class_id)
    `)
    .eq('id', packageId)
    .eq('status', 'active')
    .single()

  if (!pkg) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (pkg.teacher_id === auth.user.id) {
    return NextResponse.json({ error: 'cannot_enroll_own_package' }, { status: 400 })
  }

  const classIds: string[] = (pkg.items ?? []).map((item: any) => item.class_id)
  if (classIds.length === 0) return NextResponse.json({ error: 'empty_package' }, { status: 400 })

  // Upsert package_enrollment
  const { data: existing } = await (admin as any)
    .from('package_enrollments')
    .select('id, status')
    .eq('package_id', packageId)
    .eq('student_id', auth.user.id)
    .single()

  if (existing && existing.status !== 'cancelled') {
    return NextResponse.json({ error: 'already_enrolled', package_enrollment_id: existing.id }, { status: 409 })
  }

  let packageEnrollmentId: string
  if (existing?.status === 'cancelled') {
    const { data: updated } = await (admin as any)
      .from('package_enrollments')
      .update({ status: 'pending_payment', receipt_url: null, amount: pkg.price })
      .eq('id', existing.id)
      .select()
      .single()
    packageEnrollmentId = updated.id
  } else {
    const { data: newEnrollment } = await (admin as any)
      .from('package_enrollments')
      .insert({ package_id: packageId, student_id: auth.user.id, status: 'pending_payment', amount: pkg.price })
      .select()
      .single()
    packageEnrollmentId = newEnrollment.id
  }

  // Create individual class enrollments
  for (const classId of classIds) {
    const { data: existingEnrollment } = await (admin as any)
      .from('enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('student_id', auth.user.id)
      .single()

    if (existingEnrollment) {
      if (existingEnrollment.status === 'cancelled') {
        await (admin as any)
          .from('enrollments')
          .update({ status: 'pending_payment' })
          .eq('id', existingEnrollment.id)
      }
      // already enrolled (active) → skip
    } else {
      await (admin as any)
        .from('enrollments')
        .insert({ class_id: classId, student_id: auth.user.id, status: 'pending_payment' })
    }
  }

  return NextResponse.json({ package_enrollment_id: packageEnrollmentId })
}
