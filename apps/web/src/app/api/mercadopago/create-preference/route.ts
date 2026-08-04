import { NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'
import { paidPlanConfig, annualPlanPrice } from '@danceclass/shared'

export async function POST(request: Request) {
  let user: any = null

  const authHeader = request.headers.get('Authorization')
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

  const rlHit = await checkRateLimit(`enroll:${user.id}`, 'enroll')
  if (rlHit) return rlHit

  const body = await request.json()
  const plan = body.plan as string
  const period: 'annual' | 'monthly' = body.period === 'annual' ? 'annual' : 'monthly'

  const config = paidPlanConfig(plan)
  if (!config) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  // El anual lleva ANNUAL_DISCOUNT_RATE de descuento sobre 12 meses. El monto
  // sale del mismo helper que anuncia la UI: si se recalculara acá a mano, se
  // podría cobrar algo distinto de lo que se le mostró al usuario.
  const unitPrice = period === 'annual' ? annualPlanPrice(config.price) : config.price
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

  logger.info('create_preference', { plan, period, price: unitPrice })

  return NextResponse.json({ init_point: checkoutUrl })
}
