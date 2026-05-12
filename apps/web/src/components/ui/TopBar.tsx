import Link from 'next/link'
import { Music2, Bell } from 'lucide-react'
import type { Profile } from '@danceclass/shared'
import Avatar from './Avatar'

interface TopBarProps {
  profile: Profile | null
  unreadCount: number
}

export default function TopBar({ profile, unreadCount }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="mx-auto max-w-lg px-4 h-14 flex items-center justify-between">
        <Link href="/feed" className="flex items-center gap-2">
          <Music2 className="h-6 w-6 text-brand-600" />
          <span className="text-lg font-bold text-gray-900">DanceClass</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/notifications" className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <Bell className="h-5 w-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
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
