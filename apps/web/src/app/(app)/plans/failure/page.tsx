import Link from 'next/link'
import { XCircle } from 'lucide-react'

export default function PlanFailurePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <XCircle className="h-9 w-9 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago no completado</h1>
      <p className="text-gray-500 text-sm mb-8">
        Hubo un problema con tu pago. No se realizó ningún cargo.
      </p>
      <Link href="/plans" className="btn-primary px-8">
        Volver a los planes
      </Link>
    </div>
  )
}
