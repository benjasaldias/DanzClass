import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'

const BUCKET = 'payment-receipts'
// Los comprobantes de entrada a evento vivieron en `event-media` (bucket
// PÚBLICO) hasta S7. Los nuevos van a `payment-receipts`; los ya subidos se
// siguen sirviendo desde donde están.
const LEGACY_EVENT_BUCKET = 'event-media'

function extractPath(receiptUrl: string, bucket: string): string {
  // Casos:
  //   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
  //   <path>
  const marker = `/${bucket}/`
  const idx = receiptUrl.lastIndexOf(marker)
  return idx >= 0 ? receiptUrl.slice(idx + marker.length) : receiptUrl
}

async function sign(receiptUrl: string, bucket: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.storage
    .from(bucket)
    .createSignedUrl(extractPath(receiptUrl, bucket), 3600)
  return data?.signedUrl ?? null
}

export async function GET(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const paymentId = request.nextUrl.searchParams.get('paymentId')
  // Los otros dos flujos de comprobante de la app (paquetes y entradas de
  // evento) no tenían forma de mostrarle el archivo a quien debe revisarlo:
  // profesor y organizador confirmaban a ciegas.
  const packageEnrollmentId = request.nextUrl.searchParams.get('packageEnrollmentId')
  const eventPaymentId = request.nextUrl.searchParams.get('eventPaymentId')

  const admin = createAdminClient()

  if (packageEnrollmentId) {
    const { data: pe } = await (admin as any)
      .from('package_enrollments')
      .select('id, student_id, receipt_url, package:class_packages!inner(teacher_id)')
      .eq('id', packageEnrollmentId)
      .maybeSingle()

    if (!pe?.receipt_url) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    if (userId !== pe.student_id && userId !== pe.package?.teacher_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const url = await sign(pe.receipt_url, BUCKET)
    if (!url) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
    return NextResponse.json({ url })
  }

  if (eventPaymentId) {
    const { data: ep } = await (admin as any)
      .from('event_payments')
      .select('id, user_id, receipt_url, event:events!inner(creator_id)')
      .eq('id', eventPaymentId)
      .maybeSingle()

    if (!ep?.receipt_url) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    if (userId !== ep.user_id && userId !== ep.event?.creator_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const url = await sign(ep.receipt_url, BUCKET)
    if (url) return NextResponse.json({ url })
    // Comprobante viejo: quedó en el bucket público de eventos.
    const legacy = await sign(ep.receipt_url, LEGACY_EVENT_BUCKET)
    if (!legacy) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
    return NextResponse.json({ url: legacy })
  }

  if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })

  const { data: payment } = await (admin as any)
    .from('payments')
    .select('id, receipt_url, enrollment:enrollments!inner(student_id, class:classes!inner(teacher_id))')
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment || !(payment as any).receipt_url) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const studentId = (payment as any).enrollment?.student_id
  const teacherId = (payment as any).enrollment?.class?.teacher_id
  if (userId !== studentId && userId !== teacherId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = await sign((payment as any).receipt_url, BUCKET)
  if (!url) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })

  return NextResponse.json({ url })
}
