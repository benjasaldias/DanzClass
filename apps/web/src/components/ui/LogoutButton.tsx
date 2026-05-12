'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors"
    >
      <LogOut className="h-5 w-5 text-red-400" />
      <span className="text-sm font-medium text-red-600">Cerrar sesión</span>
    </button>
  )
}
