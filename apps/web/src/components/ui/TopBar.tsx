import Link from 'next/link'
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
          href="mailto:contacto@danzclass.com?subject=Bug%20DanzClass"
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-3 py-1 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
        >
          <span className="text-[10px] font-bold leading-tight text-violet-700 dark:text-violet-300">Versión Alpha</span>
          <span className="text-[9px] leading-tight text-violet-500 dark:text-violet-400">Reportar Error</span>
        </a>

        <div className="flex items-center gap-2">
          <NotificationBell initialCount={unreadCount} userId={profile?.id} />
        </div>
      </div>
    </header>
  )
}
