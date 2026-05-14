'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PastClass {
  teacherId: string
  teacherName: string
  classTitle: string
  classId: string
}

interface EndorsementPopupProps {
  endorserId: string
  pastClasses: PastClass[]
}

export default function EndorsementPopup({ endorserId, pastClasses }: EndorsementPopupProps) {
  const [current, setCurrent] = useState<PastClass | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (pastClasses.length === 0) return
    const dismissed = JSON.parse(localStorage.getItem('endorsement_dismissed') ?? '[]') as string[]
    const toShow = pastClasses.find((c) => !dismissed.includes(`${endorserId}:${c.teacherId}:${c.classId}`))
    if (toShow) setCurrent(toShow)
  }, [pastClasses, endorserId])

  function dismiss() {
    if (!current) return
    const key = `${endorserId}:${current.teacherId}:${current.classId}`
    const prev = JSON.parse(localStorage.getItem('endorsement_dismissed') ?? '[]') as string[]
    localStorage.setItem('endorsement_dismissed', JSON.stringify([...prev, key]))
    setCurrent(null)
  }

  async function endorse() {
    if (!current) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('trust_endorsements' as any).upsert(
      { endorser_id: endorserId, endorsed_id: current.teacherId } as any,
      { onConflict: 'endorser_id,endorsed_id', ignoreDuplicates: true }
    )
    dismiss()
    setLoading(false)
  }

  if (!current) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-2xl bg-white shadow-2xl border border-gray-100 p-5">
        <button onClick={dismiss} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
            <ShieldCheck className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">¿Recomiendas a este profesor?</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Tomaste <strong>{current.classTitle}</strong> con <strong>{current.teacherName}</strong>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={endorse}
            disabled={loading}
            className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            {loading ? '...' : '¡Sí, confío en este profe!'}
          </button>
          <button
            onClick={dismiss}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            No
          </button>
        </div>
      </div>
    </div>
  )
}
