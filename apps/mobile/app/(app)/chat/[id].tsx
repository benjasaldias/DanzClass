import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Send, Users } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'
import Avatar from '../../../components/ui/Avatar'

const WEB_URL = 'https://dc-project-web.vercel.app'

type Message = {
  id: string
  content: string
  created_at: string
  sender: { id: string; full_name: string; username: string; avatar_url: string | null }
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [chat, setChat] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const flatRef = useRef<FlatList>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    setCurrentUserId(session.user.id)
    setToken(session.access_token)

    const [messagesRes, chatRes, participantsRes] = await Promise.all([
      fetch(`${WEB_URL}/api/chat/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((r) => r.json()),
      (supabase as any).from('chats').select(`
        id, type, class_id, rehearsal_id,
        class:classes(id, title, teacher_id, teacher:profiles!teacher_id(full_name, username, avatar_url)),
        rehearsal:rehearsals(id, title)
      `).eq('id', chatId).single(),
      (supabase as any).from('chat_participants').select('user_id, user:profiles!user_id(id, full_name, username, avatar_url)').eq('chat_id', chatId),
    ])

    setMessages(messagesRes.messages ?? [])
    setChat(chatRes.data)
    setParticipants(participantsRes.data ?? [])
    setLoading(false)
  }, [chatId])

  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    if (!chatId) return
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const newMsg = payload.new as any
          const { data: sender } = await (supabase as any).from('profiles').select('id, full_name, username, avatar_url').eq('id', newMsg.sender_id).single()
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, sender: sender ?? { id: newMsg.sender_id, full_name: '?', username: '?', avatar_url: null } }]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatId])

  // Scroll to end on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

  async function handleSend() {
    const content = text.trim()
    if (!content || sending || !currentUserId) return
    setSending(true)
    setText('')
    await (supabase as any).from('chat_messages').insert({ chat_id: chatId, sender_id: currentUserId, content })
    setSending(false)
  }

  const isGroup = chat?.type === 'rehearsal'
  const chatTitle = chat?.type === 'class' ? (chat?.class?.title ?? 'Chat de clase') : (chat?.rehearsal?.title ?? 'Chat de ensayo')
  const otherParticipant = isGroup ? null : participants.find((p: any) => p.user_id !== currentUserId)?.user

  const bg = isDark ? '#1A1035' : '#ffffff'
  const surfaceBg = isDark ? '#241547' : '#f9fafb'
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: isDark ? '#3D2870' : '#f3f4f6', backgroundColor: isDark ? '#241547' : '#ffffff',
        }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <ChevronLeft stroke={isDark ? '#EEEDFE' : '#374151'} size={22} />
          </TouchableOpacity>
          {isGroup ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' }}>
                <Users stroke="#7c3aed" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }} numberOfLines={1}>{chatTitle}</Text>
                <Text style={{ fontSize: 11, color: subColor }}>{participants.length} participantes</Text>
              </View>
            </View>
          ) : otherParticipant ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Avatar src={otherParticipant.avatar_url} name={otherParticipant.full_name} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }} numberOfLines={1}>{otherParticipant.full_name}</Text>
                <Text style={{ fontSize: 11, color: subColor }} numberOfLines={1}>{chatTitle}</Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '700', color: textColor, flex: 1 }} numberOfLines={1}>{chatTitle}</Text>
          )}
        </View>

        {/* Messages */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Send stroke={subColor} size={36} />
              <Text style={{ color: subColor, fontSize: 14, marginTop: 12 }}>Sé el primero en escribir 👋</Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const isMe = msg.sender.id === currentUserId
            return (
              <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
                {!isMe && <Avatar src={msg.sender.avatar_url} name={msg.sender.full_name} size="xs" />}
                <View style={{ maxWidth: '72%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {isGroup && !isMe && (
                    <Text style={{ fontSize: 11, color: subColor, marginBottom: 2, marginLeft: 4 }}>{msg.sender.full_name}</Text>
                  )}
                  <View style={{
                    borderRadius: 18,
                    borderBottomRightRadius: isMe ? 4 : 18,
                    borderBottomLeftRadius: isMe ? 18 : 4,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    backgroundColor: isMe ? '#8b5cf6' : surfaceBg,
                  }}>
                    <Text style={{ fontSize: 14, color: isMe ? '#fff' : textColor, lineHeight: 20 }}>{msg.content}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: subColor, marginTop: 2, marginHorizontal: 4 }}>{timeLabel(msg.created_at)}</Text>
                </View>
              </View>
            )
          }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
          borderTopWidth: 1, borderTopColor: isDark ? '#3D2870' : '#f3f4f6', backgroundColor: isDark ? '#241547' : '#ffffff',
        }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje..."
            placeholderTextColor={subColor}
            multiline
            maxLength={1000}
            style={{
              flex: 1, borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#3D2870' : '#e5e7eb',
              backgroundColor: isDark ? '#2E1B5C' : '#f9fafb',
              paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: textColor, maxHeight: 100,
            }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={{
              width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
              backgroundColor: text.trim() && !sending ? '#8b5cf6' : (isDark ? '#3D2870' : '#e5e7eb'),
            }}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send stroke="#fff" size={18} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}
