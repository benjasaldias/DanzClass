'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface LogoutButtonProps {
  asButton?: boolean
  asRow?: boolean
}

export default function LogoutButton({ asButton, asRow }: LogoutButtonProps = {}) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  if (asRow) {
    return (
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400">
          <LogOut className="h-[18px] w-[18px]" />
        </div>
        <span className="flex-1 text-sm font-semibold text-red-600 dark:text-red-400">Cerrar sesión</span>
      </button>
    )
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
