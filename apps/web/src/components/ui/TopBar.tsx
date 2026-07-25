import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import type { Profile } from '@danceclass/shared'
import LogoIcon from './LogoIcon'
import NotificationBell from './NotificationBell'

interface TopBarProps {
  profile: Profile | null
  unreadCount: number
}

export default function TopBar({ profile, unreadCount }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-dark-bg/90 backdrop-blur-md border-b border-gray-100 dark:border-dark-border pt-safe">
      <div className="relative mx-auto max-w-lg px-4 h-14 flex items-center justify-between">
        <Link href="/feed" className="flex items-center gap-2">
          <LogoIcon className="h-6 w-6 text-brand-600 dark:text-brand-300" />
          {/* Hidden on the narrowest screens (≤380px) so it can't collide with the centered Alpha pill */}
          <span className="text-lg font-bold text-gray-900 dark:text-dark-text max-[380px]:hidden">DanzClass</span>
        </Link>

        {/* Alpha pill — centered */}
        <a
          href="mailto:contacto@danzclass.com?subject=Error%20o%20sugerencia%20DanzClass"
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-3 py-1 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
        >
          <span className="text-[10px] font-bold leading-tight text-violet-700 dark:text-violet-300">Versión Alpha</span>
          <span className="text-[9px] leading-tight text-violet-500 dark:text-violet-400">Error o sugerencia</span>
        </a>

        <div className="flex items-center gap-0.5">
          {profile ? (
            <>
              <Link
                href="/chats"
                aria-label="Mis chats"
                className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
              >
                <MessageCircle className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
              </Link>
              <NotificationBell initialCount={unreadCount} userId={profile.id} />
            </>
          ) : (
            <Link
              href="/auth/login"
              className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
