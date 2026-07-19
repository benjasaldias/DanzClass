'use client'

import { useState, useEffect } from 'react'
import { Users, MapPin, Clock, Sparkles, ChevronRight, X } from 'lucide-react'

const STORAGE_PREFIX = 'danzclass_onboarding_v1_seen'
// El feed es público (visible sin sesión) desde la sesión 2026-07-18; el tour
// solo debe dispararse al primer login de una cuenta recién creada, nunca para
// visitantes anónimos ni para cuentas antiguas que inician sesión en un browser
// nuevo. Usamos profiles.created_at como proxy de "cuenta nueva": el registro
// exige confirmar el correo (hasta 24h antes del cron de limpieza) antes del
// primer login real, así que 24h cubre ese primer login sin disparar para
// cuentas ya establecidas.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000

const STEPS = [
  {
    icon: Users,
    color: 'text-brand-600 dark:text-brand-300',
    bg: 'bg-brand-50 dark:bg-brand-950/30',
    title: 'Sigue a tus profes favoritos',
    desc: 'Busca profesores por estilo en "Explorar" y síguelos para ver sus clases en tu feed de "Siguiendo".',
  },
  {
    icon: MapPin,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    title: 'Configura tu ciudad',
    desc: 'Agrega tu ciudad en tu perfil y activa el filtro "Cerca" para descubrir clases en tu zona.',
  },
  {
    icon: Clock,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    title: 'Marca tus horarios libres',
    desc: 'En "Agenda" configura cuándo estás disponible. Los profesores podrán coordinarse contigo.',
  },
  {
    icon: Sparkles,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    title: '¡Empieza a inscribirte!',
    desc: 'Entra a cualquier clase, reserva tu cupo y sube tu comprobante de pago. ¡Ya eres parte de la comunidad!',
  },
]

interface OnboardingTourProps {
  /** null = sin sesión (visitante anónimo del feed público) — nunca se muestra. */
  currentUserId: string | null
  /** `profiles.created_at` del usuario logueado; usado para detectar cuenta nueva. */
  accountCreatedAt: string | null
}

export default function OnboardingTour({ currentUserId, accountCreatedAt }: OnboardingTourProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  // Flag por cuenta (no global): dos usuarios distintos en el mismo browser no
  // heredan el "ya visto" del otro.
  const storageKey = currentUserId ? `${STORAGE_PREFIX}:${currentUserId}` : null

  useEffect(() => {
    if (!currentUserId || !storageKey) return
    const isNewAccount = !!accountCreatedAt && (Date.now() - new Date(accountCreatedAt).getTime()) < NEW_ACCOUNT_WINDOW_MS
    if (!isNewAccount) return
    try {
      if (!localStorage.getItem(storageKey)) setVisible(true)
    } catch {}
  }, [currentUserId, storageKey, accountCreatedAt])

  function dismiss() {
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1') } catch {}
    }
    setVisible(false)
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-2xl overflow-hidden">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-brand-600 dark:bg-brand-400' : 'w-1.5 bg-gray-200 dark:bg-dark-border'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 flex flex-col items-center text-center gap-3">
          <div className={`h-14 w-14 rounded-2xl ${current.bg} flex items-center justify-center`}>
            <Icon className={`h-7 w-7 ${current.color}`} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text leading-tight">{current.title}</h2>
          <p className="text-sm text-gray-500 dark:text-dark-text2 leading-relaxed">{current.desc}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={dismiss}
            className="flex-1 text-sm text-gray-400 dark:text-dark-text2 hover:text-gray-600 transition-colors py-2"
          >
            Saltar
          </button>
          <button
            onClick={next}
            className="flex-[2] flex items-center justify-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2.5 transition-colors"
          >
            {step < STEPS.length - 1 ? (
              <>Siguiente <ChevronRight className="h-4 w-4" /></>
            ) : (
              <>¡Empezar! <Sparkles className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
