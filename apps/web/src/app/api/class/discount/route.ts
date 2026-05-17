import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { class_id, discount_price, discount_price_monthly } = await req.json()
  if (!class_id) return NextResponse.json({ error: 'Missing class_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verify ownership
  const { data: cls } = await admin
    .from('classes')
    .select('id, teacher_id, title, type')
    .eq('id', class_id)
    .eq('teacher_id', user.id)
    .single()

  if (!cls) return NextResponse.json({ error: 'Class not found or not yours' }, { status: 404 })

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
    const { data: followers } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', user.id)

    if (followers && followers.length > 0) {
      await admin.from('notifications').insert(
        followers.map((f: any) => ({
          user_id: f.follower_id,
          type: 'class_discount',
          data: {
            class_id,
            class_title: (cls as any).title,
            discount_price: discount_price ?? null,
            discount_price_monthly: discount_price_monthly ?? null,
          },
        }))
      )
    }
  }

  return NextResponse.json({ success: true })
}
