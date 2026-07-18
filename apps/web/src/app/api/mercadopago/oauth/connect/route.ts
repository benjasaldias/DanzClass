import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveTier } from '@/lib/subscription'
import { canTeach } from '@danceclass/shared'
import { buildAuthorizeUrl, signState } from '@/lib/mercadopago/oauth'

// GET /api/mercadopago/oauth/connect
// Inicia el flujo OAuth: valida que el usuario es profesor y lo redirige a la
// pantalla de autorización de Mercado Pago con un `state` firmado.
export async function GET() {
  if (!process.env.MERCADOPAGO_CLIENT_ID || !process.env.MERCADOPAGO_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Mercado Pago OAuth no está configurado' }, { status: 503 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', getBase()))

  const tier = await getActiveTier(user.id, supabase)
  if (!canTeach(tier)) {
    return NextResponse.redirect(new URL('/profile', getBase()))
  }

  const authorizeUrl = buildAuthorizeUrl(signState(user.id))
  return NextResponse.redirect(authorizeUrl)
}

function getBase(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  )
}
