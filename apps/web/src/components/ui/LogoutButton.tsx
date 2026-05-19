'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface LogoutButtonProps {
  asButton?: boolean
}

export default function LogoutButton({ asButton }: LogoutButtonProps = {}) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  if (asButton) {
    return (
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    )
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
