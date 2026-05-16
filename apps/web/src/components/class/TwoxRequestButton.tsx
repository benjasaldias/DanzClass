'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, X, Loader2, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCLP } from '@/lib/utils'

interface TwoxRequestButtonProps {
  classId: string
  classTitle: string
  userId: string
  price2x: number
  price2xLabel: string
}

type RequestState = 'idle' | 'looking' | 'matched'

export default function TwoxRequestButton({
  classId,
  classTitle,
  userId,
  price2x,
  price2xLabel,
}: TwoxRequestButtonProps) {
  const router = useRouter()
  const [state, setState] = useState<RequestState>('idle')
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    async function fetchRequest() {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('class_2x_requests')
        .select('*')
        .eq('user_id', userId)
        .eq('class_id', classId)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (data) {
        setRequest(data)
        setState(data.status === 'matched' ? 'matched' : 'looking')

        // If matched, fetch enrollment ID
        if (data.status === 'matched') {
          const { data: enrollment } = await supabase
            .from('enrollments' as any)
            .select('id')
            .eq('class_id', classId)
            .eq('student_id', userId)
            .in('status', ['pending_payment', 'payment_submitted', 'confirmed'])
            .maybeSingle()
          if (enrollment) {
            setRequest((prev: any) => ({ ...prev, enrollment_id: (enrollment as any).id }))
          }
        }
      }
      setLoading(false)
    }
    fetchRequest()
  }, [userId, classId])

  async function handleCreate() {
    setActing(true)
    const supabase = createClient()
    const { data, error } = await (supabase as any)
      .from('class_2x_requests')
      .insert({ user_id: userId, class_id: classId, status: 'looking' })
      .select()
      .single()

    if (!error && data) {
      setRequest(data)
      setState('looking')
    }
    setActing(false)
  }

  async function handleCancel() {
    if (!request) return
    setActing(true)
    const supabase = createClient()
    await (supabase as any)
      .from('class_2x_requests')
      .update({ status: 'cancelled' })
      .eq('id', request.id)
    setRequest(null)
    setState('idle')
    setActing(false)
  }

  async function handleTransferPayment() {
    if (!request) return
    setActing(true)
    await fetch('/api/class-2x/transfer-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: request.id }),
    })
    const supabase = createClient()
    const { data } = await (supabase as any)
      .from('class_2x_requests')
      .select('*')
      .eq('id', request.id)
      .single()
    setRequest(data)
    setActing(false)
  }

  if (loading) return null

  const isMyTurnToPay = request?.payment_assignee === userId

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-700">Precio pareja (2x)</p>
          <p className="text-lg font-bold text-brand-900">{formatCLP(price2x)}</p>
          <p className="text-xs text-brand-600">{price2xLabel}</p>
        </div>

        {state === 'idle' && (
          <button
            onClick={handleCreate}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Busco 2x
          </button>
        )}

        {state === 'looking' && (
          <button
            onClick={handleCancel}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-full border border-brand-300 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50"
          >
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancelar búsqueda
          </button>
        )}
      </div>

      {state === 'looking' && (
        <p className="text-xs text-brand-600 flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
          Buscando compañer@... tus amigos verán que quieres ir en pareja
        </p>
      )}

      {state === 'matched' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-green-700">¡Emparejad@! Coordinen el pago juntos.</p>
          {isMyTurnToPay ? (
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/payment/${request?.enrollment_id ?? ''}`)}
                className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Ir a pagar
              </button>
              <button
                onClick={handleTransferPayment}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Que pague mi compañer@
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Tu compañer@ tiene el turno de pago</p>
          )}
        </div>
      )}
    </div>
  )
}
