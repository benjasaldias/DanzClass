import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { notifyUsers } from '@/lib/notifyUsers'

export async function POST(req: NextRequest) {
  let user: any = null

  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const mobileSupa = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await mobileSupa.auth.getUser()
    user = data.user
  }
  if (!user) {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: max 3 discount operations per 30 min per user+class
  const { class_id, discount_price, discount_price_monthly, notify_enrolled } = await req.json()
  if (!class_id) return NextResponse.json({ error: 'Missing class_id' }, { status: 400 })

  const discountLimit = await checkRateLimit(`discount:${user.id}:${class_id}`, 'discount')
  if (discountLimit) return discountLimit

  const admin = createAdminClient()

  // Verify ownership and fetch prices
  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id, title, type, price, price_suelta')
    .eq('id', class_id)
    .eq('teacher_id', user.id)
    .single()

  if (!cls) return NextResponse.json({ error: 'Class not found or not yours' }, { status: 404 })

  // Server-side price validation
  if (discount_price != null && (!Number.isInteger(discount_price) || discount_price < 0)) {
    return NextResponse.json({ error: 'Precio de descuento inválido' }, { status: 400 })
  }
  if (discount_price_monthly != null && (!Number.isInteger(discount_price_monthly) || discount_price_monthly < 0)) {
    return NextResponse.json({ error: 'Precio de descuento mensual inválido' }, { status: 400 })
  }
  const basePrice = (cls as any).price_suelta ?? (cls as any).price
  if (discount_price != null && discount_price >= basePrice) {
    return NextResponse.json({ error: 'El descuento debe ser menor al precio original' }, { status: 400 })
  }
  if (discount_price_monthly != null && discount_price_monthly >= (cls as any).price) {
    return NextResponse.json({ error: 'El descuento mensual debe ser menor al precio mensual original' }, { status: 400 })
  }

  // Update discounts
  await (admin as any)
    .from('classes')
    .update({
      discount_price: discount_price ?? null,
      discount_price_monthly: discount_price_monthly ?? null,
    })
    .eq('id', class_id)

  // Notify followers if setting a new discount (not clearing)
  if (discount_price || discount_price_monthly) {
    const notifData = {
      class_id,
      class_title: (cls as any).title,
      discount_price: discount_price ?? null,
      discount_price_monthly: discount_price_monthly ?? null,
    }

    const { data: followers } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', user.id)

    if (followers && followers.length > 0) {
      await notifyUsers(admin, followers.map((f: any) => ({
        user_id: f.follower_id,
        type: 'class_discount' as const,
        data: notifData,
      })))
    }

    // Optionally notify enrolled students with pending payment
    if (notify_enrolled) {
      const { data: pendingEnrollments } = await admin
        .from('enrollments')
        .select('student_id')
        .eq('class_id', class_id)
        .eq('status', 'pending_payment')

      if (pendingEnrollments && pendingEnrollments.length > 0) {
        // Exclude students already notified as followers
        const followerIds = new Set((followers ?? []).map((f: any) => f.follower_id))
        const toNotify = pendingEnrollments.filter((e: any) => !followerIds.has(e.student_id))
        if (toNotify.length > 0) {
          await notifyUsers(admin, toNotify.map((e: any) => ({
            user_id: e.student_id,
            type: 'class_discount' as const,
            data: notifData,
          })))
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}
