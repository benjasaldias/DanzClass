import { NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
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
  // APP_URL es server-side (sin NEXT_PUBLIC_) y siempre está disponible en runtime.
  // NEXT_PUBLIC_APP_URL solo funciona si estuvo seteada al momento del build.
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  console.log('[create-preference] appUrl:', appUrl)

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const preference = new Preference(mp)

  const result = await preference.create({
    body: {
      items: [
        {
          id: plan,
          title: config.name,
          quantity: 1,
          currency_id: 'CLP',
          unit_price: config.price,
        },
      ],
      // {userId}:{plan} — leído en el webhook para activar la suscripción
      external_reference: `${user.id}:${plan}`,
      back_urls: {
        success: `${appUrl}/plans/success`,
        failure: `${appUrl}/plans/failure`,
        pending: `${appUrl}/plans/success`,
      },
      auto_return: 'approved',
      notification_url: `${appUrl}/api/mercadopago/webhook`,
    },
  })

  // En modo test, MP usa sandbox_init_point; en producción, init_point
  const isTest = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-') ?? false
  const checkoutUrl = isTest ? result.sandbox_init_point : result.init_point

  console.log('[create-preference] appUrl:', appUrl, '| checkoutUrl:', checkoutUrl?.slice(0, 60))

  return NextResponse.json({ init_point: checkoutUrl })
}
