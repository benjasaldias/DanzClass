import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/require-user'

const BUCKET = 'payment-receipts'

function extractPath(receiptUrl: string): string {
  // Casos:
  //   https://<proj>.supabase.co/storage/v1/object/public/payment-receipts/<path>
  //   <path>
  const marker = `/${BUCKET}/`
  const idx = receiptUrl.lastIndexOf(marker)
  return idx >= 0 ? receiptUrl.slice(idx + marker.length) : receiptUrl
}

export async function GET(request: NextRequest) {
  const authed = await requireUser(request)
  if ('error' in authed) return authed.error
  const userId = authed.user.id

  const paymentId = request.nextUrl.searchParams.get('paymentId')
  if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })

  const admin = createAdminClient()
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

  const path = extractPath((payment as any).receipt_url)
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
