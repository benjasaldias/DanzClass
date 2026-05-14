import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron runs this daily at 03:00 UTC.
// Deletes class-media storage files + class_media rows + payment-receipt files
// for classes whose deletion date has passed.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  // Protect from unauthorized calls in production
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  let deleted = 0
  let errors: string[] = []

  // ── Suelta classes: delete if date + 7 days < today ──────────────────────
  const suelataThreshold = new Date(now)
  suelataThreshold.setDate(suelataThreshold.getDate() - 7)
  const sueltaMax = suelataThreshold.toISOString().split('T')[0]

  const { data: sueltas } = await supabase
    .from('classes')
    .select('id, class_media(*)')
    .eq('type', 'suelta')
    .lt('date', sueltaMax)
    .neq('status', 'archived')

  for (const cls of sueltas ?? []) {
    const { error } = await cleanClassMedia(supabase, cls)
    if (error) errors.push(`class ${cls.id}: ${error}`)
    else deleted++
  }

  // ── Periodica classes: delete if end_of_prev_month + 7 days < today ──────
  // "end of prev month + 7" means we're now in the 8th day or later of next month
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0) // last day of prev month
  const periodicaThreshold = new Date(prevMonthEnd)
  periodicaThreshold.setDate(periodicaThreshold.getDate() + 7)

  if (now > periodicaThreshold) {
    const { data: periodicas } = await supabase
      .from('classes')
      .select('id, class_media(*)')
      .eq('type', 'periodica')
      .lt('updated_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
      .neq('status', 'archived')

    for (const cls of periodicas ?? []) {
      const { error } = await cleanClassMedia(supabase, cls)
      if (error) errors.push(`class ${cls.id}: ${error}`)
      else deleted++
    }
  }

  console.log(`[cleanup-classes] deleted=${deleted} errors=${errors.length}`)
  return NextResponse.json({ deleted, errors })
}

async function cleanClassMedia(supabase: ReturnType<typeof createAdminClient>, cls: any) {
  const media: any[] = cls.class_media ?? []

  // Remove storage objects
  const storagePaths = media.map((m: any) => {
    const url: string = m.url
    const parts = url.split('/class-media/')
    return parts[1] ?? ''
  }).filter(Boolean)

  if (storagePaths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('class-media').remove(storagePaths)
    if (storageErr) return { error: `storage: ${storageErr.message}` }
  }

  // Remove class_media rows
  await supabase.from('class_media').delete().eq('class_id', cls.id)

  // Remove payment receipts for enrollments of this class
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, student_id, payment:payments(receipt_url)')
    .eq('class_id', cls.id)

  for (const e of enrollments ?? []) {
    const payment = (e as any).payment?.[0]
    if (payment?.receipt_url) {
      const url: string = payment.receipt_url
      const parts = url.split('/payment-receipts/')
      const path = parts[1]
      if (path) {
        await supabase.storage.from('payment-receipts').remove([path])
      }
      await supabase.from('payments').update({ receipt_url: null }).eq('enrollment_id', e.id)
    }
  }

  // Mark class as archived so we don't process it again
  await supabase.from('classes').update({ status: 'completed' } as any).eq('id', cls.id)

  return { error: null }
}
