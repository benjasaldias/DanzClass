import { NextResponse } from 'next/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
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

  if (!['basic', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  const config = PLAN_CONFIG[plan]
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
  const preApproval = new PreApproval(mp)

  let result: Awaited<ReturnType<typeof preApproval.create>>
  try {
    result = await preApproval.create({
      body: {
        reason: config.name,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: config.price,
          currency_id: 'CLP',
        },
        back_url: `${appUrl}/plans/success`,
        external_reference: `${user.id}:${plan}`,
        payer_email: user.email!,
        status: 'pending',
      },
    })
  } catch (err: any) {
    console.error('[create-subscription] MP error:', JSON.stringify(err?.cause ?? err))
    return NextResponse.json(
      { error: err?.message ?? 'Error al crear suscripción en Mercado Pago' },
      { status: 500 }
    )
  }

  const isTest = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-') ?? false
  const anyResult = result as any
  const checkoutUrl = isTest
    ? (anyResult.sandbox_init_point ?? result.init_point)
    : result.init_point

  if (!checkoutUrl) {
    console.error('[create-subscription] No checkout URL returned. result:', JSON.stringify(anyResult))
    return NextResponse.json({ error: 'No se pudo obtener URL de pago' }, { status: 500 })
  }

  console.log('[create-subscription] preapproval_id:', result.id, '| checkoutUrl:', checkoutUrl?.slice(0, 60))

  return NextResponse.json({ init_point: checkoutUrl })
}
