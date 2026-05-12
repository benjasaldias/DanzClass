import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

export default function PlanSuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle className="h-9 w-9 text-green-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago exitoso</h1>
      <p className="text-gray-500 text-sm mb-1">Tu suscripción está activa.</p>
      <p className="text-gray-400 text-xs mb-8">
        Si el plan no se refleja de inmediato, espera unos segundos y recarga la app.
      </p>
      <Link href="/feed" className="btn-primary px-8">
        Ir al inicio
      </Link>
    </div>
  )
}
