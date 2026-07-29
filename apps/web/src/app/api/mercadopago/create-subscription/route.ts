import { NextResponse } from 'next/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rateLimit'

const PLAN_CONFIG: Record<string, { name: string; price: number }> = {
  basic: { name: 'DanzClass Básico', price: 1500 },
  pro:   { name: 'DanzClass Pro',    price: 3500 },
}

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
    // No volcamos el objeto completo de MP: puede arrastrar datos del payer o de
    // la request. Solo el mensaje/status (P3-3).
    logger.error('create_subscription_mp_failed', err?.message ?? err, {
      mp_status: err?.status ?? null,
      plan,
    })
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
    // Antes se logueaba el `result` completo (podía incluir datos del payer).
    logger.error('create_subscription_no_checkout_url', 'MP no devolvió init_point', {
      preapproval_id: anyResult?.id ?? null,
      plan,
    })
    return NextResponse.json({ error: 'No se pudo obtener URL de pago' }, { status: 500 })
  }

  logger.info('create_subscription', { preapproval_id: result.id, plan })

  return NextResponse.json({ init_point: checkoutUrl })
}
