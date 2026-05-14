import { NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'

const PLAN_CONFIG: Record<string, { name: string; price: number }> = {
  basic: { name: 'DanceClass Básico', price: 1500 },
  pro:   { name: 'DanceClass Pro',    price: 3500 },
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const plan = body.plan as string
  const period: 'annual' | 'monthly' = body.period === 'annual' ? 'annual' : 'monthly'

  if (!['basic', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  const config = PLAN_CONFIG[plan]
  const unitPrice = period === 'annual' ? config.price * 12 : config.price
  const title = period === 'annual'
    ? `${config.name} (Anual)`
    : config.name

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const preference = new Preference(mp)

  // external_reference: "{userId}:{plan}" para mensual, "{userId}:{plan}:annual" para anual
  const externalRef = period === 'annual'
    ? `${user.id}:${plan}:annual`
    : `${user.id}:${plan}`

  const result = await preference.create({
    body: {
      items: [
        {
          id: `${plan}-${period}`,
          title,
          quantity: 1,
          currency_id: 'CLP',
          unit_price: unitPrice,
        },
      ],
      external_reference: externalRef,
      back_urls: {
        success: `${appUrl}/plans/success`,
        failure: `${appUrl}/plans/failure`,
        pending: `${appUrl}/plans/success`,
      },
      auto_return: 'approved',
      notification_url: `${appUrl}/api/mercadopago/webhook`,
    },
  })

  const isTest = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-') ?? false
  const checkoutUrl = isTest ? result.sandbox_init_point : result.init_point

  console.log('[create-preference] plan:', plan, '| period:', period, '| price:', unitPrice)

  return NextResponse.json({ init_point: checkoutUrl })
}
