'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CHILEAN_BANKS } from '@danceclass/shared'
import type { AccountType } from '@danceclass/shared'

const schema = z.object({
  bank_name: z.string().min(1, 'Selecciona un banco'),
  account_type: z.enum(['cuenta_corriente', 'cuenta_vista', 'cuenta_rut', 'cuenta_ahorro']),
  account_number: z.string().min(4, 'Ingresa el número de cuenta'),
  rut: z.string().min(8, 'RUT inválido').max(12),
  account_holder_name: z.string().min(2, 'Ingresa el titular'),
  email: z.string().email('Email inválido'),
})

type FormData = z.infer<typeof schema>

interface PaymentInfoFormProps {
  teacherId: string
  existingInfo: any
}

export default function PaymentInfoForm({ teacherId, existingInfo }: PaymentInfoFormProps) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: existingInfo ?? {},
  })

  async function onSubmit(data: FormData) {
    const supabase = createClient()

    if (existingInfo?.id) {
      await supabase.from('teacher_payment_info').update(data).eq('id', existingInfo.id)
    } else {
      await supabase.from('teacher_payment_info').insert({ ...data, teacher_id: teacherId })
    }

    setSaved(true)
    setTimeout(() => router.push('/profile'), 1500)
  }

  return (
    <div className="px-4 py-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Datos bancarios</h1>
      <p className="text-sm text-gray-500 mb-5">Los estudiantes usarán estos datos para transferirte</p>

      {saved && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-4 flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">Guardado correctamente</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Banco *</label>
          <select {...register('bank_name')} className="input">
            <option value="">Seleccionar banco</option>
            {CHILEAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {errors.bank_name && <p className="mt-1 text-xs text-red-600">{errors.bank_name.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo de cuenta *</label>
          <select {...register('account_type')} className="input">
            <option value="cuenta_corriente">Cuenta Corriente</option>
            <option value="cuenta_vista">Cuenta Vista</option>
            <option value="cuenta_rut">Cuenta RUT</option>
            <option value="cuenta_ahorro">Cuenta Ahorro</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Número de cuenta *</label>
          <input {...register('account_number')} placeholder="000000000" className="input" />
          {errors.account_number && <p className="mt-1 text-xs text-red-600">{errors.account_number.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">RUT *</label>
          <input {...register('rut')} placeholder="12.345.678-9" className="input" />
          {errors.rut && <p className="mt-1 text-xs text-red-600">{errors.rut.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre titular *</label>
          <input {...register('account_holder_name')} placeholder="Nombre completo del titular" className="input" />
          {errors.account_holder_name && <p className="mt-1 text-xs text-red-600">{errors.account_holder_name.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Email para transferencia *</label>
          <input {...register('email')} type="email" placeholder="tu@email.com" className="input" />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting || saved} className="btn-primary w-full py-3">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar datos bancarios'}
        </button>
      </form>
    </div>
  )
}
