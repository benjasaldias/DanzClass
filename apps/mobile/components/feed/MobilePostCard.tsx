import { useState } from 'react'
import { View, Text, Image, TouchableOpacity, Share } from 'react-native'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Play, Eye, Users, Lock, Share2 } from 'lucide-react-native'

const WEB_URL = 'https://dc-project-web.vercel.app'

interface MobilePostCardProps {
  post: any
  currentUserId: string
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

const VISIBILITY_ICON: Record<string, { icon: typeof Eye; label: string }> = {
  followers: { icon: Eye, label: 'Seguidores' },
  friends: { icon: Lock, label: 'Amigos' },
}

export default function MobilePostCard({ post, currentUserId }: MobilePostCardProps) {
  const router = useRouter()
  const [playing, setPlaying] = useState(false)
  const author = post.author ?? post.profiles
  const visibilityInfo = VISIBILITY_ICON[post.visibility]

  async function handleShare() {
    try {
      await Share.share({
        message: post.title ? `${post.title} — DanzClass` : 'Mira este video en DanzClass',
        url: `${WEB_URL}/feed`,
      })
    } catch {
      // user dismissed share sheet
    }
  }

  const player = useVideoPlayer(post.video_url ?? '', (p) => {
    p.loop = false
  })

  const initials = (author?.full_name ?? '')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <View className="border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
      {/* Author header */}
      <TouchableOpacity
        onPress={() => author?.username && author.id !== currentUserId && router.push(`/(app)/teacher/${author.username}` as any)}
        activeOpacity={author?.id === currentUserId ? 1 : 0.7}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        {author?.avatar_url ? (
          <Image source={{ uri: author.avatar_url }} className="w-10 h-10 rounded-full" />
        ) : (
          <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
            <Text className="text-brand-700 font-bold text-sm">{initials}</Text>
          </View>
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{author?.full_name}</Text>
          <Text className="text-xs text-gris-humo dark:text-dark-text2">{timeAgo(post.created_at)}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {visibilityInfo && (
            <View className="flex-row items-center gap-1 bg-lavanda-suave rounded-full px-2 py-1">
              <visibilityInfo.icon size={11} stroke="#534AB7" />
              <Text className="text-xs" style={{ color: '#534AB7' }}>{visibilityInfo.label}</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Share2 size={16} stroke="#6B6880" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Video / thumbnail */}
      {post.video_url ? (
        <View className="bg-black" style={{ minHeight: 200 }}>
          {playing ? (
            <VideoView
              player={player}
              style={{ width: '100%', aspectRatio: undefined, minHeight: 200, maxHeight: 600 }}
              contentFit="contain"
              allowsFullscreen
              allowsPictureInPicture={false}
            />
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => { setPlaying(true); player.play() }}
              style={{ minHeight: 200 }}
              className="items-center justify-center"
            >
              {post.thumbnail_url ? (
                <Image
                  source={{ uri: post.thumbnail_url }}
                  className="w-full"
                  style={{ minHeight: 200, maxHeight: 500 }}
                  resizeMode="contain"
                />
              ) : (
                <View className="w-full bg-gray-900" style={{ minHeight: 200 }} />
              )}
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-16 h-16 rounded-full bg-black/50 items-center justify-center">
                  <Play size={28} stroke="white" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Title + description */}
      {(post.title || post.description) && (
        <View className="px-4 pt-3 pb-4 gap-1">
          {post.title && (
            <Text className="font-semibold text-gray-900 dark:text-dark-text text-sm">{post.title}</Text>
          )}
          {post.description && (
            <Text className="text-sm text-gray-600 dark:text-dark-text2 leading-snug">{post.description}</Text>
          )}
        </View>
      )}
    </View>
  )
}
