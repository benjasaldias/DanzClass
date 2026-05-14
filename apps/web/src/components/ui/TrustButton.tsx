'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface TrustButtonProps {
  endorsedId: string
  endorserId: string
  initialEndorsed: boolean
  initialCount: number
}

export default function TrustButton({ endorsedId, endorserId, initialEndorsed, initialCount }: TrustButtonProps) {
  const [endorsed, setEndorsed] = useState(initialEndorsed)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const supabase = createClient()
    if (endorsed) {
      await supabase.from('trust_endorsements' as any).delete()
        .eq('endorser_id', endorserId).eq('endorsed_id', endorsedId)
      setCount((c) => c - 1)
      setEndorsed(false)
    } else {
      await supabase.from('trust_endorsements' as any).insert({ endorser_id: endorserId, endorsed_id: endorsedId } as any)
      setCount((c) => c + 1)
      setEndorsed(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border transition-colors',
        endorsed
          ? 'bg-green-50 border-green-200 text-green-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
          : 'border-gray-200 text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-700'
      )}
    >
      <ShieldCheck className="h-4 w-4" />
      {endorsed ? `Confío (${count})` : `Confío (${count})`}
    </button>
  )
}
