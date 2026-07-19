import { createAdminClient } from './supabase/admin'
import { sendPushToUsers } from './push'
import { issueAttendanceToken } from './qrAttendance'

// Shared by /api/payment/confirm (teacher clicks "Confirmar"),
// /api/payment/scan (AI auto-confirms a 'clean' receipt when
// app_settings.auto_confirm_enabled is on) and the Mercado Pago webhook
// (in-app split payment approved) — all end in the same write + notification,
// differing only in who gets credited via `confirmed_by` and, for MP, the
// mp_payment_id/mp_status recorded on the payment.
//   - confirmedBy 'teacher' | 'ai' → revisión humana / IA de una transferencia.
//   - confirmedBy null → pago Mercado Pago (el CHECK de confirmed_by es
//     ('ai','teacher','admin'); 'mp' no aplica, así que queda null y el
//     método se distingue por payment_method='mp' + mp_payment_id).
export async function autoConfirmPayment(params: {
  paymentId: string
  enrollmentId: string
  studentId: string
  classId: string
  classTitle: string
  confirmedBy: 'teacher' | 'ai' | null
  mp?: { paymentId: string; status: string }
}): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  await (admin as any).from('payments').update({
    status: 'verified',
    verified_at: now,
    confirmed_by: params.confirmedBy,
    confirmed_at: now,
    ...(params.mp ? { mp_payment_id: params.mp.paymentId, mp_status: params.mp.status } : {}),
  }).eq('id', params.paymentId)

  await admin.from('enrollments').update({ status: 'confirmed' } as any).eq('id', params.enrollmentId)

  // Emite/rota el token QR de asistencia (best-effort, no rompe la confirmación).
  await issueAttendanceToken(admin, {
    enrollmentId: params.enrollmentId,
    studentId: params.studentId,
    classId: params.classId,
  })

  await admin.from('notifications').insert({
    user_id: params.studentId,
    type: 'payment_confirmed',
    data: { class_id: params.classId },
  } as any)

  sendPushToUsers([params.studentId], {
    title: 'Pago confirmado ✅',
    body: `Tu pago para "${params.classTitle}" fue confirmado`,
    data: { type: 'payment_confirmed', class_id: params.classId },
  }).catch(() => {})
}
