import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell } from 'lucide-react-native'
import LogoIcon from './LogoIcon'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

interface TopBarProps {
  title?: string
}

export default function TopBar({ title }: TopBarProps) {
  const router = useRouter()
  const { isDark } = useTheme()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
      setUnreadCount(count ?? 0)
    }
    load()
  }, [])

  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
      {/* Logo */}
      <View className="flex-row items-center gap-1.5">
        <LogoIcon size={22} />
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">{title ?? 'DanzClass'}</Text>
      </View>

      {/* Actions */}
      <View className="flex-row items-center gap-3">
        {/* Notification bell */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/notifications' as any)}
          className="relative"
        >
          <Bell size={22} stroke={isDark ? '#A39BBF' : '#6b7280'} />
          {unreadCount > 0 && (
            <View className="absolute -top-1 -right-1 bg-brand-600 rounded-full min-w-[16px] h-4 items-center justify-center px-0.5">
              <Text className="text-white text-[10px] font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}
