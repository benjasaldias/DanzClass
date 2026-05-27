'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface NotificationBellProps {
  initialCount: number
  userId?: string | null
}

export default function NotificationBell({ initialCount, userId }: NotificationBellProps) {
  const [count, setCount] = useState(initialCount)
  const pathname = usePathname()

  // Sync with server-rendered count on navigation
  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  // Reset badge when user visits the notifications page
  useEffect(() => {
    if (pathname === '/notifications') {
      setCount(0)
    }
  }, [pathname])

  // Subscribe to new notifications via Supabase Realtime
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notif-badge:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => setCount((c) => c + 1)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return (
    <Link
      href="/notifications"
      className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
    >
      <Bell className="h-5 w-5 text-gray-600 dark:text-dark-text2" />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
