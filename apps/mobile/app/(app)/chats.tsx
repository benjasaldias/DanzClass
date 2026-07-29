import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, MessageCircle, Users, BookOpen } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import Avatar from '../../components/ui/Avatar'
import { WEB_URL } from '@danceclass/shared'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function ChatsScreen() {
  const router = useRouter()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [chats, setChats] = useState<any[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    setCurrentUserId(session.user.id)

    const res = await fetch(`${WEB_URL}/api/chat/list`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const { chats: data } = await res.json()
      setChats(data ?? [])
    }
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const bg = isDark ? '#1A1035' : '#ffffff'
  const surfaceBg = isDark ? '#241547' : '#ffffff'
  const borderColor = isDark ? '#3D2870' : '#f3f4f6'
  const textColor = isDark ? '#EEEDFE' : '#111827'
  const subColor = isDark ? '#A39BBF' : '#6b7280'

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <ChevronLeft stroke={isDark ? '#EEEDFE' : '#374151'} size={22} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MessageCircle stroke="#8b5cf6" size={20} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: textColor }}>Mensajes</Text>
        </View>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <MessageCircle stroke={isDark ? '#A39BBF' : '#d1d5db'} size={40} />
            <Text style={{ color: subColor, fontSize: 14, fontWeight: '600', marginTop: 12 }}>Sin mensajes aún</Text>
            <Text style={{ color: subColor, fontSize: 12, marginTop: 4, textAlign: 'center', maxWidth: 260 }}>
              Inscríbete en una clase para chatear con el profesor.
            </Text>
          </View>
        }
        renderItem={({ item: chat }: { item: any }) => {
          const isGroup = chat.type === 'rehearsal'
          const otherParticipant = isGroup ? null
            : (chat.participants ?? []).find((p: any) => p.user_id !== currentUserId)?.user
          const title = chat.type === 'class' ? (chat.class?.title ?? 'Chat de clase') : (chat.rehearsal?.title ?? 'Chat de ensayo')
          const displayName = isGroup ? title : (otherParticipant?.full_name ?? title)
          const lastMsg = chat.last_message
          const hasUnread = lastMsg && chat.last_read_at ? new Date(lastMsg.created_at) > new Date(chat.last_read_at) : !!lastMsg

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/chat/${chat.id}` as any)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: borderColor,
                backgroundColor: surfaceBg,
              }}
            >
              {isGroup ? (
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' }}>
                  <Users stroke="#7c3aed" size={20} />
                </View>
              ) : otherParticipant ? (
                <Avatar url={otherParticipant.avatar_url ?? null} name={otherParticipant.full_name} size="md" />
              ) : (
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#2E1B5C' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen stroke={subColor} size={20} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: hasUnread ? '700' : '600', color: textColor, flex: 1 }} numberOfLines={1}>{displayName}</Text>
                  {lastMsg && <Text style={{ fontSize: 10, color: subColor, flexShrink: 0 }}>{timeAgo(lastMsg.created_at)}</Text>}
                </View>
                {!isGroup && <Text style={{ fontSize: 11, color: subColor }} numberOfLines={1}>{title}</Text>}
                {lastMsg && (
                  <Text style={{ fontSize: 12, color: hasUnread ? textColor : subColor, fontWeight: hasUnread ? '500' : '400' }} numberOfLines={1}>
                    {lastMsg.sender_id === currentUserId ? 'Tú: ' : ''}{lastMsg.content}
                  </Text>
                )}
              </View>
              {hasUnread && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#8b5cf6', flexShrink: 0 }} />}
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}
