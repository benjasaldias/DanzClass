import { NextResponse } from 'next/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import type { SubscriptionTier } from '@danceclass/shared'

const PLAN_CONFIG: Record<Exclude<SubscriptionTier, 'none'>, { name: string; price: number }> = {
  basic: { name: 'DanceClass Básico', price: 1000 },
  teacher: { name: 'DanceClass Profesor', price: 1500 },
  pro: { name: 'DanceClass Pro', price: 2000 },
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const plan = body.plan as string

  if (!['basic', 'teacher', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  const config = PLAN_CONFIG[plan as Exclude<SubscriptionTier, 'none'>]
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const preApproval = new PreApproval(mp)

  const result = await preApproval.create({
    body: {
      reason: config.name,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: config.price,
        currency_id: 'CLP',
        start_date: new Date().toISOString(),
        end_date: null,
      },
      back_url: `${appUrl}/plans/success`,
      external_reference: `${user.id}:${plan}`,
      payer_email: user.email!,
      status: 'pending',
    },
  })

  const isTest = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-') ?? false
  const anyResult = result as any
  const checkoutUrl = isTest
    ? (anyResult.sandbox_init_point ?? result.init_point)
    : result.init_point

  console.log('[create-subscription] preapproval_id:', result.id, '| checkoutUrl:', checkoutUrl?.slice(0, 60))

  return NextResponse.json({ init_point: checkoutUrl })
}
