'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Profile } from '@danceclass/shared'

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface UserCardProps {
  user: Profile
  currentUserId: string
  initialFollowing: boolean
  initialFriendStatus: FriendStatus
}

export default function UserCard({ user, currentUserId, initialFollowing, initialFriendStatus }: UserCardProps) {
  const router = useRouter()
  const supabase = createClient()

  const [following, setFollowing] = useState(initialFollowing)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>(initialFriendStatus)
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [loadingFriend, setLoadingFriend] = useState(false)
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false)

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation()
    if (!currentUserId) return
    setLoadingFollow(true)
    if (following) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', user.id)
      setFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: user.id })
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'follow',
        data: { from_user_id: currentUserId },
      })
      setFollowing(true)
    }
    setLoadingFollow(false)
  }

  async function handleFriendAction(e: React.MouseEvent) {
    e.stopPropagation()
    if (!currentUserId) return

    if (friendStatus === 'accepted') {
      setShowUnfriendConfirm(true)
      return
    }

    setLoadingFriend(true)
    if (friendStatus === 'none') {
      await supabase.from('friendships').insert({ requester_id: currentUserId, addressee_id: user.id, status: 'pending' })
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'friend_request',
        data: { from_user_id: currentUserId },
      })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      await supabase.from('friendships').update({ status: 'accepted' })
        .eq('requester_id', user.id)
        .eq('addressee_id', currentUserId)
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'friend_accepted',
        data: { from_user_id: currentUserId },
      })
      setFriendStatus('accepted')
    }
    setLoadingFriend(false)
  }

  async function handleUnfriendConfirm() {
    setLoadingFriend(true)
    await supabase.from('friendships').delete()
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    setFriendStatus('none')
    setShowUnfriendConfirm(false)
    setLoadingFriend(false)
  }

  const friendLabel = {
    none: 'Agregar amig@',
    pending_sent: 'Solicitud enviada',
    pending_received: 'Aceptar solicitud',
    accepted: 'Amig@',
  }[friendStatus]

  const FriendIcon = {
    none: UserPlus,
    pending_sent: Clock,
    pending_received: UserCheck,
    accepted: UserCheck,
  }[friendStatus]

  return (
    <>
      {showUnfriendConfirm && (
        <ConfirmDialog
          title="Eliminar amig@"
          message={`¿Seguro que quieres eliminar a @${user.username} de tus amigos?`}
          confirmLabel="Eliminar"
          destructive
          loading={loadingFriend}
          onConfirm={handleUnfriendConfirm}
          onCancel={() => { setShowUnfriendConfirm(false) }}
        />
      )}

      <div
        onClick={() => router.push(`/teacher/${user.username}`)}
        className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer"
      >
        <Avatar src={user.avatar_url} name={user.full_name} size="md" />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{user.full_name}</p>
          <p className="text-xs text-gray-500">@{user.username}</p>
          {user.city && <p className="text-xs text-gray-400 mt-0.5">{user.city}</p>}
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Seguir */}
          <button
            onClick={toggleFollow}
            disabled={loadingFollow}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              following
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {following ? 'Siguiendo' : 'Seguir'}
          </button>

          {/* Amistad */}
          <button
            onClick={handleFriendAction}
            disabled={loadingFriend || friendStatus === 'pending_sent'}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 ${
              friendStatus === 'accepted'
                ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                : friendStatus === 'pending_sent'
                ? 'bg-gray-100 text-gray-500 cursor-default'
                : friendStatus === 'pending_received'
                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FriendIcon className="h-3 w-3" />
            {friendLabel}
          </button>
        </div>
      </div>
    </>
  )
}
