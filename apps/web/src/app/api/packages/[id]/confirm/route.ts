import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifyUsers'
import { confirmEnrollment } from '@/lib/payments'
import { logger } from '@/lib/logger'

// Reparte el precio del paquete entre sus clases: el resto de la división cae en
// la primera, así la suma de los pagos es EXACTAMENTE lo que pagó el alumno (y
// lo que el Panel Financiero del profesor va a sumar).
function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) return []
  const base = Math.floor(total / parts)
  const out = new Array(parts).fill(base)
  out[0] += total - base * parts
  return out
}

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
    .select('id, teacher_id, price, items:class_package_items(class_id, class:classes(id, title))')
    .eq('id', packageId)
    .single()

  if (!pkg || pkg.teacher_id !== auth.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: pkgEnrollment } = await (admin as any)
    .from('package_enrollments')
    .select('id, student_id, status, amount, receipt_url')
    .eq('id', package_enrollment_id)
    .eq('package_id', packageId)
    .single()

  if (!pkgEnrollment) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const items: any[] = pkg.items ?? []
  const classIds: string[] = items.map((i: any) => i.class_id)

  if (action === 'confirm') {
    await (admin as any)
      .from('package_enrollments')
      .update({ status: 'confirmed' })
      .eq('id', package_enrollment_id)

    // Las inscripciones del paquete se confirmaban con un UPDATE plano, igual
    // que hacía el `/dashboard` zombi (audit P0-2) y el botón del profesor antes
    // de S4 (P1-8): quedaban `confirmed` SIN token QR de asistencia —el alumno
    // llegaba a clase y el escáner lo rechazaba— y sin ninguna fila en
    // `payments`, así que el ingreso del paquete era invisible en el Panel
    // Financiero, en el historial y en el CSV del profesor. Ahora cada clase del
    // paquete registra su parte del pago y se confirma por el camino completo.
    const total: number = pkgEnrollment.amount ?? pkg.price ?? 0
    const shares = splitAmount(total, classIds.length)

    const { data: enrollments } = await (admin as any)
      .from('enrollments')
      .select('id, class_id, status, payment:payments(id, status, billing_period)')
      .in('class_id', classIds)
      .eq('student_id', pkgEnrollment.student_id)
      .neq('status', 'cancelled')

    const now = new Date().toISOString()

    for (const [idx, classId] of classIds.entries()) {
      const enrollment = (enrollments ?? []).find((e: any) => e.class_id === classId)
      if (!enrollment) continue

      const payRow = {
        amount: shares[idx] ?? 0,
        status: 'verified',
        payment_method: 'transfer',
        commission_amount: 0,
        receipt_url: pkgEnrollment.receipt_url ?? null,
        recipient_teacher_id: pkg.teacher_id,
        confirmed_by: 'teacher',
        confirmed_at: now,
        verified_at: now,
        submitted_at: now,
      }

      // `payments_one_per_enrollment` (índice único parcial, migración 068) sólo
      // admite un pago sin `billing_period` por inscripción: si el alumno ya
      // había intentado pagar esa clase por separado, se reusa esa fila.
      const rows = Array.isArray(enrollment.payment)
        ? enrollment.payment
        : enrollment.payment ? [enrollment.payment] : []
      const existing = rows.find((p: any) => !p.billing_period)

      if (existing) {
        if (existing.status !== 'verified') {
          const { error } = await (admin as any).from('payments').update(payRow).eq('id', existing.id)
          if (error) logger.error('package_confirm_payment_update_failed', error, { packageId, classId })
        }
      } else {
        const { error } = await (admin as any)
          .from('payments')
          .insert({ enrollment_id: enrollment.id, ...payRow })
        if (error) logger.error('package_confirm_payment_insert_failed', error, { packageId, classId })
      }

      // notify: false → un solo aviso al final, no uno por clase del paquete.
      await confirmEnrollment(admin, {
        enrollmentId: enrollment.id,
        studentId: pkgEnrollment.student_id,
        classId,
        classTitle: items[idx]?.class?.title ?? '',
        notify: false,
      })
    }

    // Notify student (use first class_id as reference for the notification)
    // `sendNotifications` (lib/notifications) es el helper del NAVEGADOR: hace
    // `fetch('/api/notifications/send')` con URL relativa, que en Node no se
    // puede resolver. Llamarlo desde esta ruta lanzaba `TypeError: Failed to
    // parse URL` y la ruta entera respondía 500 — o sea, confirmar o rechazar el
    // pago de un paquete SIEMPRE fallaba, y el profesor no veía ningún error
    // (el cliente sólo miraba `res.ok`). Server-side va `notifyUsers`.
    if (classIds[0]) {
      await notifyUsers(admin, [{
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

    // Rechazar dejaba las inscripciones de clase en `payment_submitted`: el
    // alumno seguía viendo "el profesor está verificando tu pago" en cada clase
    // del paquete mientras el paquete ya había vuelto a "pendiente de pago", y
    // el profesor las veía como pagos por verificar sin nada que revisar.
    await (admin as any)
      .from('enrollments')
      .update({ status: 'pending_payment' })
      .in('class_id', classIds)
      .eq('student_id', pkgEnrollment.student_id)
      .eq('status', 'payment_submitted')

    if (classIds[0]) {
      await notifyUsers(admin, [{
        user_id: pkgEnrollment.student_id,
        type: 'payment_rejected',
        data: { class_id: classIds[0], package_id: packageId },
      }])
    }
  }

  return NextResponse.json({ ok: true })
}
