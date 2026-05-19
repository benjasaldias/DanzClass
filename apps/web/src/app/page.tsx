import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Music2, Users, Calendar, CreditCard } from 'lucide-react'

export default async function LandingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/feed')

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-purple-900 text-white">
      <div className="mx-auto max-w-md px-6 py-16 flex flex-col items-center text-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
            <Music2 className="h-8 w-8 text-brand-300" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold tracking-tight">DanzClass</h1>
            <p className="text-sm text-brand-300">Chile</p>
          </div>
        </div>

        {/* Tagline */}
        <div className="space-y-3">
          <h2 className="text-3xl font-bold leading-tight">
            Clases de baile,<br />sin el caos
          </h2>
          <p className="text-brand-200 leading-relaxed">
            Conecta con los mejores profesores de baile, reserva tu cupo y paga sin complicaciones.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {[
            { icon: Users, label: 'Sigue profesores', desc: 'Feed personalizado' },
            { icon: Calendar, label: 'Reserva cupos', desc: 'En tiempo real' },
            { icon: CreditCard, label: 'Paga fácil', desc: 'Sube tu comprobante' },
            { icon: Music2, label: 'Todos los estilos', desc: 'Salsa, urban, y más' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 p-4 text-left">
              <Icon className="h-5 w-5 text-brand-300 mb-2" />
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-brand-300 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 w-full">
          <Link href="/auth/register" className="btn-primary w-full py-3 text-base rounded-2xl bg-white text-brand-700 hover:bg-brand-50">
            Crear cuenta gratis
          </Link>
          <Link href="/auth/login" className="btn-ghost w-full py-3 text-base rounded-2xl text-white hover:bg-white/10">
            Ya tengo cuenta
          </Link>
        </div>

        <p className="text-xs text-brand-400">
          Hecho en Chile 🇨🇱 para la comunidad de baile
        </p>
      </div>
    </main>
  )
}
