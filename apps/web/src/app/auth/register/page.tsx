'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Music2, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  full_name: z.string().min(2, 'Ingresa tu nombre completo'),
  username: z.string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y _'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  city: z.string().optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar los Términos de Uso para continuar' }),
  }),
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          username: data.username.toLowerCase(),
        },
        emailRedirectTo: `${window.location.origin}/feed`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Este email ya está registrado')
      } else {
        setError(error.message)
      }
      return
    }

    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-purple-900 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center">
                <MailCheck className="h-8 w-8 text-brand-600" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Revisa tu correo</h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Te enviamos un enlace de confirmación. Haz clic en él para activar tu cuenta y luego inicia sesión.
            </p>
            <Link
              href="/auth/login"
              className="btn-primary w-full py-3 block text-center"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-purple-900 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/20">
              <Music2 className="h-6 w-6 text-brand-300" />
            </div>
            <span className="text-xl font-bold text-white">DanzClass</span>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Crear cuenta</h1>
          <p className="text-sm text-gray-500 mb-6">Únete a la comunidad de baile</p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre completo</label>
              <input {...register('full_name')} placeholder="Tu nombre" className="input" />
              {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Usuario</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                <input {...register('username')} placeholder="tuusuario" className="input pl-7" />
              </div>
              {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input {...register('email')} type="email" placeholder="tu@email.com" className="input" autoComplete="email" />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad</label>
              <input {...register('city')} placeholder="Santiago, Valparaíso..." className="input" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  className="input pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {/* Términos de Uso */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  {...register('acceptTerms')}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600 leading-snug">
                  He leído y acepto los{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-brand-600 hover:text-brand-700 underline"
                  >
                    Términos de Uso
                  </Link>
                  , incluyendo que soy responsable del contenido que publico y declaro tener los derechos
                  sobre cualquier audio y video que suba a la plataforma.
                </span>
              </label>
              {errors.acceptTerms && (
                <p className="mt-1 text-xs text-red-600">{errors.acceptTerms.message}</p>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            ¿Ya tienes cuenta?{' '}
            <Link href="/auth/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
