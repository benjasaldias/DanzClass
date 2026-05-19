import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, Music } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'

interface TopBarProps {
  title?: string
}

export default function TopBar({ title }: TopBarProps) {
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initials, setInitials] = useState('U')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [profileRes, notifRes] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
        supabase.from('notifications').select('id', { count: 'exact' }).eq('user_id', user.id).eq('read', false),
      ])

      if (profileRes.data) {
        setAvatarUrl(profileRes.data.avatar_url ?? null)
        const parts = (profileRes.data.full_name ?? '').split(' ')
        setInitials(parts.map((p: string) => p[0]).slice(0, 2).join('').toUpperCase() || 'U')
      }
      setUnreadCount(notifRes.count ?? 0)
    }
    load()
  }, [])

  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
      {/* Logo */}
      <View className="flex-row items-center gap-1.5">
        <Music size={20} stroke="#c026d3" />
        <Text className="text-lg font-bold text-gray-900">{title ?? 'DanceClass'}</Text>
      </View>

      {/* Actions */}
      <View className="flex-row items-center gap-3">
        {/* Notification bell */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/notifications' as any)}
          className="relative"
        >
          <Bell size={22} stroke="#6b7280" />
          {unreadCount > 0 && (
            <View className="absolute -top-1 -right-1 bg-brand-600 rounded-full min-w-[16px] h-4 items-center justify-center px-0.5">
              <Text className="text-white text-[10px] font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile' as any)}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <View className="w-8 h-8 rounded-full bg-brand-100 items-center justify-center">
              <Text className="text-brand-700 text-xs font-bold">{initials}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}
