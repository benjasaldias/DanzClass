import Link from 'next/link'
import type { Profile } from '@danceclass/shared'
import Avatar from './Avatar'
import LogoIcon from './LogoIcon'
import NotificationBell from './NotificationBell'

interface TopBarProps {
  profile: Profile | null
  unreadCount: number
}

export default function TopBar({ profile, unreadCount }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-dark-bg/90 backdrop-blur-md border-b border-gray-100 dark:border-dark-border">
      <div className="mx-auto max-w-lg px-4 h-14 flex items-center justify-between">
        <Link href="/feed" className="flex items-center gap-2">
          <LogoIcon className="h-6 w-6 text-brand-600 dark:text-brand-300" />
          <span className="text-lg font-bold text-gray-900 dark:text-dark-text">DanzClass</span>
        </Link>

        <div className="flex items-center gap-2">
          <NotificationBell initialCount={unreadCount} userId={profile?.id} />
          <Link href="/profile">
            <Avatar
              src={profile?.avatar_url}
              name={profile?.full_name ?? '?'}
              size="sm"
            />
          </Link>
        </div>
      </div>
    </header>
  )
}
