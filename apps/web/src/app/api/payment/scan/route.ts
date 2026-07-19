import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'
import { checkRateLimit } from '@/lib/rateLimit'
import { scanReceipt, type ReceiptMediaType } from '@/lib/ai/scanReceipt'
import { autoConfirmPayment } from '@/lib/payments'
import { logger } from '@/lib/logger'

// The Anthropic vision call can take a few seconds — give it more room than
// the other payment routes (which never call an external model).
export const maxDuration = 30

const BUCKET = 'payment-receipts'

function extractPath(receiptUrl: string): string {
  const marker = `/${BUCKET}/`
  const idx = receiptUrl.lastIndexOf(marker)
  return idx >= 0 ? receiptUrl.slice(idx + marker.length) : receiptUrl
}

function mediaTypeFromPath(path: string): ReceiptMediaType | null {
  const ext = path.toLowerCase().split('?')[0].split('.').pop()
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'pdf': return 'application/pdf'
    default: return null
  }
}

function normalizeText(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, '').toUpperCase()
}

// Tolerant match — OCR/vision extraction can drop accents, middle names, etc.
// Real match confirmation is a human decision (the teacher), this is just a heads-up.
function namesOverlap(a: string, b: string): boolean {
  const tokensA = new Set(normalizeText(a).split(' ').filter((t) => t.length >= 3))
  const tokensB = normalizeText(b).split(' ').filter((t) => t.length >= 3)
  return tokensB.some((t) => tokensA.has(t))
}

// Triggered by the student's client right after a receipt upload (best-effort,
// non-blocking — see PaymentClient.tsx / mobile payment/[enrollmentId].tsx).
// Only this route talks to Anthropic; the verdict (clean/issue) is computed
// here deterministically against known values, not left to the model.
export async function POST(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const body = await request.json().catch(() => ({}))
  const { paymentId } = body as { paymentId?: string }
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  const limitHit = await checkRateLimit(`payment_scan:${userId}`, 'scan')
  if (limitHit) return limitHit

  const admin = createAdminClient()

  const { data: payment } = await (admin as any)
    .from('payments')
    .select(`
      id, amount, status, receipt_url, scan_status,
      enrollment:enrollments!inner(id, status, student_id,
        class:classes!inner(id, teacher_id, title,
          teacher:profiles!teacher_id(id, ai_scan_preference,
            payment_info:teacher_payment_info(rut, account_holder_name))))
    `)
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const enrollment = payment.enrollment
  const cls = enrollment?.class
  const teacher = cls?.teacher
  if (!cls || (userId !== enrollment.student_id && userId !== cls.teacher_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Idempotent — never re-call the model once a payment already has a verdict.
  if (payment.scan_status === 'scanned' || payment.scan_status === 'skipped') {
    return NextResponse.json({ ok: true, scan_status: payment.scan_status })
  }

  // Respect the teacher's preference. `null` (unanswered) defaults to manual — conservative.
  if (teacher?.ai_scan_preference !== 'ai') {
    await admin.from('payments').update({ scan_status: 'skipped' } as any).eq('id', paymentId)
    return NextResponse.json({ ok: true, scan_status: 'skipped' })
  }

  if (!payment.receipt_url) {
    await admin.from('payments').update({ scan_status: 'failed' } as any).eq('id', paymentId)
    return NextResponse.json({ ok: true, scan_status: 'failed' })
  }

  const path = extractPath(payment.receipt_url)
  const mediaType = mediaTypeFromPath(path)

  let extraction
  try {
    if (!mediaType) throw new Error('Unsupported receipt file type')
    const { data: fileData, error: downloadError } = await admin.storage.from(BUCKET).download(path)
    if (downloadError || !fileData) throw new Error('Could not download receipt from storage')
    const buffer = Buffer.from(await fileData.arrayBuffer())
    extraction = await scanReceipt({ base64: buffer.toString('base64'), mediaType })
  } catch (err) {
    logger.error('payment_scan_failed', err, { paymentId })
    await admin.from('payments').update({ scan_status: 'failed' } as any).eq('id', paymentId)
    return NextResponse.json({ ok: true, scan_status: 'failed' })
  }

  const paymentInfo = Array.isArray(teacher?.payment_info) ? teacher.payment_info[0] : teacher?.payment_info

  const issues: string[] = []
  if (!extraction.readable) {
    issues.push('No pudimos leer el comprobante con claridad')
  } else {
    if (extraction.amount == null) {
      issues.push('No pudimos identificar el monto en el comprobante')
    } else if (extraction.amount !== payment.amount) {
      issues.push(`El monto del comprobante (${extraction.amount}) no coincide con el monto esperado (${payment.amount})`)
    }

    if (paymentInfo?.rut && extraction.recipient_rut && normalizeRut(paymentInfo.rut) !== normalizeRut(extraction.recipient_rut)) {
      issues.push('El RUT del destinatario no coincide con los datos bancarios registrados')
    } else if (
      paymentInfo?.account_holder_name && extraction.recipient_name &&
      !namesOverlap(paymentInfo.account_holder_name, extraction.recipient_name)
    ) {
      issues.push('El nombre del destinatario no coincide con los datos bancarios registrados')
    }
  }
  if (extraction.notes) issues.push(extraction.notes)

  const scanResult = {
    fields: {
      monto: extraction.amount,
      numero_operacion: extraction.operation_number,
      destinatario: extraction.recipient_name,
      rut_destinatario: extraction.recipient_rut,
      banco: extraction.bank_name,
      fecha: extraction.date,
    },
    confidence: extraction.confidence,
    issues,
  }

  let aiVerdict: 'clean' | 'issue' = issues.length > 0 ? 'issue' : 'clean'

  const { error: updateError } = await (admin as any)
    .from('payments')
    .update({
      scan_status: 'scanned',
      scan_result: scanResult,
      ai_verdict: aiVerdict,
      operation_number: extraction.operation_number,
      recipient_teacher_id: cls.teacher_id,
    })
    .eq('id', paymentId)

  if (updateError?.code === '23505') {
    // This operation_number was already used against this teacher — force an
    // issue and drop the number so the row can actually be written.
    scanResult.issues.push('Este número de operación ya fue usado en otro pago')
    aiVerdict = 'issue'
    await (admin as any)
      .from('payments')
      .update({
        scan_status: 'scanned',
        scan_result: scanResult,
        ai_verdict: 'issue',
        operation_number: null,
        recipient_teacher_id: cls.teacher_id,
      })
      .eq('id', paymentId)
  }

  if (aiVerdict === 'clean' && payment.status === 'pending') {
    const { data: setting } = await (admin as any)
      .from('app_settings')
      .select('value')
      .eq('key', 'auto_confirm_enabled')
      .maybeSingle()

    if (setting?.value === true) {
      await autoConfirmPayment({
        paymentId,
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        classId: cls.id,
        classTitle: cls.title ?? 'una clase',
        confirmedBy: 'ai',
      })
    }
  }

  return NextResponse.json({ ok: true, scan_status: 'scanned', ai_verdict: aiVerdict })
}
