'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Instagram, Users, UserPlus, UserMinus, Music2, UserCheck, Clock, BookOpen, Star, Video } from 'lucide-react'
import { cn, formatCLP, formatDate, formatTime } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StarRating from '@/components/ui/StarRating'
import RatingModal from '@/components/ui/RatingModal'
import PostCard from '@/components/feed/PostCard'
import { DAYS_OF_WEEK } from '@danceclass/shared'
import type { Profile } from '@danceclass/shared'

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface TeacherProfileClientProps {
  teacher: Profile
  classes: any[]
  enrolledClasses: any[]
  posts: any[]
  followersCount: number
  isFollowing: boolean
  currentUserId?: string
  isOwnProfile: boolean
  friendStatus: FriendStatus
  classesCount: number
  paidSpotsCount: number
  avgStars: number
  ratingCount: number
  myRating: number | null
  canRate: boolean
}

export default function TeacherProfileClient({
  teacher,
  classes,
  enrolledClasses,
  posts,
  followersCount: initialFollowers,
  isFollowing: initialIsFollowing,
  currentUserId,
  isOwnProfile,
  friendStatus: initialFriendStatus,
  classesCount,
  paidSpotsCount,
  avgStars: initialAvgStars,
  ratingCount: initialRatingCount,
  myRating: initialMyRating,
  canRate,
}: TeacherProfileClientProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followers, setFollowers] = useState(initialFollowers)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>(initialFriendStatus)
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [loadingFriend, setLoadingFriend] = useState(false)
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [myRating, setMyRating] = useState<number | null>(initialMyRating)
  const [avgStars, setAvgStars] = useState(initialAvgStars)
  const [ratingCount, setRatingCount] = useState(initialRatingCount)

  const supabase = createClient()

  async function handleFollowToggle() {
    if (!currentUserId) return
    setLoadingFollow(true)
    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('following_id', teacher.id)
      setFollowers((f) => f - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: teacher.id })
      await supabase.from('notifications').insert({
        user_id: teacher.id,
        type: 'follow',
        data: { from_user_id: currentUserId },
      })
      setFollowers((f) => f + 1)
    }
    setIsFollowing(!isFollowing)
    setLoadingFollow(false)
  }

  async function handleFriendAction() {
    if (!currentUserId) return
    if (friendStatus === 'accepted') {
      setShowUnfriendConfirm(true)
      return
    }
    setLoadingFriend(true)
    if (friendStatus === 'none') {
      await supabase.from('friendships').insert({ requester_id: currentUserId, addressee_id: teacher.id, status: 'pending' })
      await supabase.from('notifications').insert({ user_id: teacher.id, type: 'friend_request', data: { from_user_id: currentUserId } })
      setFriendStatus('pending_sent')
    } else if (friendStatus === 'pending_received') {
      await supabase.from('friendships').update({ status: 'accepted' })
        .eq('requester_id', teacher.id).eq('addressee_id', currentUserId)
      await supabase.from('notifications').insert({ user_id: teacher.id, type: 'friend_accepted', data: { from_user_id: currentUserId } })
      setFriendStatus('accepted')
    }
    setLoadingFriend(false)
  }

  async function handleUnfriendConfirm() {
    if (!currentUserId) return
    setLoadingFriend(true)
    await supabase.from('friendships').delete()
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
      .or(`requester_id.eq.${teacher.id},addressee_id.eq.${teacher.id}`)
    setFriendStatus('none')
    setShowUnfriendConfirm(false)
    setLoadingFriend(false)
  }

  function handleRated(stars: number) {
    const isNew = myRating === null
    const prevStars = myRating ?? 0
    setMyRating(stars)
    if (isNew) {
      const newCount = ratingCount + 1
      setRatingCount(newCount)
      setAvgStars(Math.round(((avgStars * ratingCount + stars) / newCount) * 10) / 10)
    } else {
      setAvgStars(Math.round(((avgStars * ratingCount - prevStars + stars) / ratingCount) * 10) / 10)
    }
  }

  const friendBtnLabel = {
    none: 'Agregar amig@',
    pending_sent: 'Solicitud enviada',
    pending_received: 'Aceptar solicitud',
    accepted: 'Amig@',
  }[friendStatus]
  const FriendIcon = { none: UserPlus, pending_sent: Clock, pending_received: UserCheck, accepted: UserCheck }[friendStatus]

  return (
    <div className="flex flex-col">
      {showUnfriendConfirm && (
        <ConfirmDialog
          title="Eliminar amig@"
          message={`¿Seguro que quieres eliminar a @${teacher.username} de tus amigos?`}
          confirmLabel="Eliminar"
          destructive
          loading={loadingFriend}
          onConfirm={handleUnfriendConfirm}
          onCancel={() => setShowUnfriendConfirm(false)}
        />
      )}
      {showRatingModal && currentUserId && (
        <RatingModal
          teacherId={teacher.id}
          teacherName={teacher.full_name}
          raterId={currentUserId}
          initialRating={myRating}
          onClose={() => setShowRatingModal(false)}
          onRate={handleRated}
        />
      )}

      {/* Header */}
      <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
        <Avatar src={teacher.avatar_url} name={teacher.full_name} size="xl" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">{teacher.full_name}</h1>
          <p className="text-sm text-gray-500 dark:text-dark-text2">@{teacher.username}</p>
        </div>

        {teacher.bio && <p className="text-sm text-gray-600 dark:text-dark-text2 leading-relaxed max-w-xs">{teacher.bio}</p>}

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text2 flex-wrap justify-center">
          {teacher.city && (
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{teacher.city}</span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <strong className="text-gray-900 dark:text-dark-text">{followers}</strong> seguidores
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap justify-center mt-1">
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-gray-900 dark:text-dark-text">{classesCount}</span>
            <span className="text-[11px] text-gray-500 dark:text-dark-text2 flex items-center gap-0.5"><BookOpen className="h-3 w-3" /> clases dictadas</span>
          </div>
          <div className="h-7 w-px bg-gray-200 dark:bg-dark-border" />
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-gray-900 dark:text-dark-text">{paidSpotsCount}</span>
            <span className="text-[11px] text-gray-500 dark:text-dark-text2 flex items-center gap-0.5"><Star className="h-3 w-3" /> cupos pagados</span>
          </div>
          {ratingCount > 0 && (
            <>
              <div className="h-7 w-px bg-gray-200 dark:bg-dark-border" />
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold text-brand-600">{avgStars.toFixed(1)}</span>
                  <StarRating value={avgStars} readOnly size="sm" />
                </div>
                <span className="text-[11px] text-gray-500 dark:text-dark-text2">{ratingCount} valoracion{ratingCount !== 1 ? 'es' : ''}</span>
              </div>
            </>
          )}
        </div>

        {teacher.instagram_handle && (
          <a href={`https://instagram.com/${teacher.instagram_handle}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-700">
            <Instagram className="h-4 w-4" />@{teacher.instagram_handle}
          </a>
        )}

        {!isOwnProfile && currentUserId && (
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={handleFollowToggle} disabled={loadingFollow}
              className={cn('flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border transition-colors',
                isFollowing
                  ? 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-red-200 hover:text-red-600'
                  : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
              )}>
              {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {isFollowing ? 'Dejar de seguir' : 'Seguir'}
            </button>

            <button onClick={handleFriendAction}
              disabled={loadingFriend || friendStatus === 'pending_sent'}
              className={cn('flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border transition-colors',
                friendStatus === 'accepted' ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400' :
                friendStatus === 'pending_sent' ? 'border-gray-200 dark:border-dark-border text-gray-400 dark:text-dark-text2/50 cursor-default' :
                friendStatus === 'pending_received' ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50' :
                'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-brand-400 hover:text-brand-700'
              )}>
              <FriendIcon className="h-4 w-4" />
              {friendBtnLabel}
            </button>

            {canRate && (
              <button
                onClick={() => setShowRatingModal(true)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold border transition-colors',
                  myRating !== null
                    ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                    : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text2 hover:border-brand-300 hover:text-brand-700'
                )}
              >
                <Star className="h-4 w-4" />
                {myRating !== null ? `Mi valoración: ${myRating}` : 'Valorar'}
              </button>
            )}
          </div>
        )}

        {isOwnProfile && (
          <Link href="/profile/edit" className="btn-secondary">Editar perfil</Link>
        )}
      </div>

      {/* Estilos de baile */}
      {(((teacher.styles_dancing?.length ?? 0) > 0 || (teacher.styles_teaching?.length ?? 0) > 0) || isOwnProfile) && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-dark-border pt-4">
          {(teacher.styles_dancing?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-dark-text2 uppercase tracking-wider mb-2">Baila</p>
              <div className="flex flex-wrap gap-1.5">
                {teacher.styles_dancing.map((s) => (
                  <span key={s} className="badge bg-lavanda-suave text-violeta-oscuro">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(teacher.styles_teaching?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-dark-text2 uppercase tracking-wider mb-2">Enseña</p>
              <div className="flex flex-wrap gap-1.5">
                {teacher.styles_teaching.map((s) => (
                  <span key={s} className="badge bg-brand-50 text-brand-700">{s}</span>
                ))}
              </div>
            </div>
          )}
          {isOwnProfile && (teacher.styles_dancing?.length ?? 0) === 0 && (teacher.styles_teaching?.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400 italic">
              Sin estilos especificados —{' '}
              <Link href="/profile/edit" className="text-brand-600 underline underline-offset-2">añade tus estilos</Link>
            </p>
          )}
        </div>
      )}

      {/* Clases publicadas */}
      {classes.length > 0 && (
        <div className="px-4 pb-6 border-t border-gray-100 dark:border-dark-border pt-4">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-3">Clases activas</h2>
          <div className="space-y-3">
            {classes.map((cls) => <ClassMiniCard key={cls.id} cls={cls} />)}
          </div>
        </div>
      )}

      {/* Clases inscritas */}
      {enrolledClasses.length > 0 && (
        <div className="px-4 pb-6 border-t border-gray-100 dark:border-dark-border pt-4">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-3">
            {isOwnProfile ? 'Mis inscripciones' : 'Inscrito/a en'}
          </h2>
          <div className="space-y-3">
            {enrolledClasses.map((e: any) => e.class && <ClassMiniCard key={e.id} cls={e.class} />)}
          </div>
        </div>
      )}

      {/* Publicaciones (videos) */}
      {posts.length > 0 && (
        <div className="border-t border-gray-100 pt-4 pb-2">
          <h2 className="font-bold text-gray-900 dark:text-dark-text mb-1 px-4 flex items-center gap-2">
            <Video className="h-4 w-4 text-brand-500" />
            {isOwnProfile ? 'Mis publicaciones' : 'Publicaciones'}
          </h2>
          <div>
            {posts.map((post: any) => (
              <PostCard key={post.id} post={post} currentUserId={currentUserId} />
            ))}
          </div>
        </div>
      )}

      {classes.length === 0 && enrolledClasses.length === 0 && posts.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center text-gray-500 dark:text-dark-text2 border-t border-gray-100 dark:border-dark-border">
          <Music2 className="h-10 w-10 text-gray-300 dark:text-dark-border mb-3" />
          <p className="text-sm">Sin actividad pública aún</p>
        </div>
      )}
    </div>
  )
}

function ClassMiniCard({ cls }: { cls: any }) {
  const firstMedia = cls.media?.[0]
  const recurrenceLabel: Record<string, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const schedule = cls.type === 'suelta'
    ? `${formatDate(cls.date)} · ${formatTime(cls.time)}`
    : cls.recurrence === 'custom'
      ? `${cls.custom_dates?.length ?? 0} clases · ${formatTime(cls.recurring_time)}`
      : `${recurrenceLabel[cls.recurrence] ?? ''} · ${DAYS_OF_WEEK[cls.day_of_week]} · ${formatTime(cls.recurring_time)}`

  return (
    <Link href={`/class/${cls.id}`} className="card flex gap-3 p-3 hover:shadow-md transition-shadow">
      {firstMedia ? (
        <div className="relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
          {firstMedia.type === 'image'
            ? <Image src={firstMedia.url} alt={cls.title} fill className="object-cover" sizes="80px" />
            : <video src={firstMedia.url} className="h-full w-full object-cover" />}
        </div>
      ) : (
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
          <Music2 className="h-8 w-8 text-brand-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">{cls.title}</p>
        {cls.dance_style && (
          <p className="text-xs text-brand-600">
            {cls.dance_style}{cls.class_type ? ` - ${cls.class_type}` : ''}
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-dark-text2 mt-1">{schedule}</p>
        <p className="mt-1 text-sm font-bold text-gray-900 dark:text-dark-text">{formatCLP(cls.price)}</p>
        {cls.price_suelta && (
          <p className="text-xs text-gray-400 dark:text-dark-text2/60">Suelta: {formatCLP(cls.price_suelta)}</p>
        )}
      </div>
    </Link>
  )
}
