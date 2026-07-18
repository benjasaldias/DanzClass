import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import { sendPushToUsers } from '@/lib/push'
import { logger } from '@/lib/logger'
import { autoConfirmPayment } from '@/lib/payments'

type Action = 'confirm' | 'reject' | 'revert'

// Teacher-facing endpoint: confirms, rejects, or reverts (undoes an AI
// auto-confirmation of) a single payment. The client never writes to
// `payments`/`enrollments` directly for this flow — this route is the only
// place that validates the transition and performs the write.
export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const body = await request.json().catch(() => ({}))
  const { paymentId, action } = body as { paymentId?: string; action?: Action }

  if (!paymentId || !['confirm', 'reject', 'revert'].includes(action ?? '')) {
    return NextResponse.json({ error: 'paymentId and a valid action are required' }, { status: 400 })
  }

  const limitHit = await checkRateLimit(`payment_confirm:${userId}`, 'notif')
  if (limitHit) return limitHit

  const admin = createAdminClient()

  const { data: payment } = await (admin as any)
    .from('payments')
    .select(`
      id, status, confirmed_by,
      enrollment:enrollments!inner(id, status, student_id,
        class:classes!inner(id, teacher_id, title))
    `)
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const enrollment = payment.enrollment
  const cls = enrollment?.class
  if (!cls || cls.teacher_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()

  if (action === 'confirm' || action === 'reject') {
    if (payment.status !== 'pending') {
      return NextResponse.json({ error: 'Payment is not awaiting review' }, { status: 409 })
    }

    if (action === 'confirm') {
      await autoConfirmPayment({
        paymentId,
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        classId: cls.id,
        classTitle: cls.title ?? 'una clase',
        confirmedBy: 'teacher',
      })
      return NextResponse.json({ ok: true, paymentStatus: 'verified', enrollmentStatus: 'confirmed' })
    }

    await admin.from('payments').update({
      status: 'rejected',
      verified_at: null,
      confirmed_by: 'teacher',
      confirmed_at: now,
    } as any).eq('id', paymentId)

    await admin.from('enrollments').update({ status: 'pending_payment' } as any).eq('id', enrollment.id)

    await admin.from('notifications').insert({
      user_id: enrollment.student_id,
      type: 'payment_rejected',
      data: { class_id: cls.id },
    } as any)

    sendPushToUsers([enrollment.student_id], {
      title: 'Pago rechazado',
      body: `Tu pago para "${cls.title ?? 'una clase'}" fue rechazado`,
      data: { type: 'payment_rejected', class_id: cls.id },
    }).catch(() => {})

    return NextResponse.json({ ok: true, paymentStatus: 'rejected', enrollmentStatus: 'pending_payment' })
  }

  // action === 'revert' — undo an AI auto-confirmation, sending the payment back for manual review.
  if (payment.confirmed_by !== 'ai' || payment.status !== 'verified') {
    return NextResponse.json({ error: 'Only an AI-confirmed payment can be reverted' }, { status: 409 })
  }

  await admin.from('payments').update({
    status: 'pending',
    verified_at: null,
    confirmed_by: null,
    confirmed_at: null,
  } as any).eq('id', paymentId)

  await admin.from('enrollments').update({ status: 'payment_submitted' } as any).eq('id', enrollment.id)

  logger.warn('payment_ai_confirmation_reverted', { paymentId, teacherId: userId, enrollmentId: enrollment.id })

  return NextResponse.json({ ok: true, paymentStatus: 'pending', enrollmentStatus: 'payment_submitted' })
}
