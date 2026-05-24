'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, BookOpen, User, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canTeach } from '@danceclass/shared'
import type { SubscriptionTier } from '@danceclass/shared'

interface BottomNavProps {
  tier: SubscriptionTier
}

export default function BottomNav({ tier }: BottomNavProps) {
  const pathname = usePathname()

  const baseLinks = [
    { href: '/feed', icon: Home, label: 'Inicio' },
    { href: '/explore', icon: Search, label: 'Explorar' },
  ]

  const teacherLinks = [
    ...baseLinks,
    { href: '/publish', icon: PlusSquare, label: 'Publicar' },
    { href: '/my-classes', icon: BookOpen, label: 'Mis clases' },
    { href: '/agenda', icon: CalendarDays, label: 'Agenda' },
    { href: '/profile', icon: User, label: 'Perfil' },
  ]

  const studentLinks = [
    ...baseLinks,
    { href: '/my-classes', icon: BookOpen, label: 'Mis clases' },
    { href: '/agenda', icon: CalendarDays, label: 'Agenda' },
    { href: '/profile', icon: User, label: 'Perfil' },
  ]

  const links = canTeach(tier) ? teacherLinks : studentLinks

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-dark-bg/95 backdrop-blur-md border-t border-gray-100 dark:border-dark-border safe-area-pb">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-around h-16">
          {links.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || (href !== '/feed' && (pathname ?? '').startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-gray-500 dark:text-dark-text2 hover:text-gray-700 dark:hover:text-dark-text'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive && 'fill-brand-100')} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
