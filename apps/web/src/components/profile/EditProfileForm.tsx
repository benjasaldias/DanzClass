'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Camera, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/ui/Avatar'
import StylesPicker from '@/components/ui/StylesPicker'
import type { Profile } from '@danceclass/shared'

interface EditProfileFormProps {
  profile: Profile
}

export default function EditProfileForm({ profile }: EditProfileFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile.full_name)
  const [username, setUsername] = useState(profile.username)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [instagram, setInstagram] = useState(profile.instagram_handle ?? '')
  const [stylesDancing, setStylesDancing] = useState<string[]>(profile.styles_dancing ?? [])
  const [stylesTaching, setStylesTeaching] = useState<string[]>(profile.styles_teaching ?? [])
  const [enrolledPublic, setEnrolledPublic] = useState(profile.enrolled_classes_public ?? true)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    let avatarUrl = profile.avatar_url

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${profile.id}/avatar.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })

      if (uploadError) {
        setError('Error al subir foto de perfil')
        setSaving(false)
        return
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path)
      avatarUrl = urlData.publicUrl
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        city: city.trim() || null,
        instagram_handle: instagram.trim().replace(/^@/, '') || null,
        avatar_url: avatarUrl,
        styles_dancing: stylesDancing,
        styles_teaching: stylesTaching,
        enrolled_classes_public: enrolledPublic,
      })
      .eq('id', profile.id)

    if (updateError) {
      if (updateError.message.includes('unique') || updateError.message.includes('duplicate')) {
        setError('Ese nombre de usuario ya está en uso')
      } else {
        setError(updateError.message)
      }
      setSaving(false)
      return
    }

    router.push('/profile')
    router.refresh()
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Editar perfil</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar
              src={avatarPreview ?? profile.avatar_url}
              name={fullName || profile.full_name}
              size="xl"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-md hover:bg-brand-700 transition-colors"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          {avatarFile && (
            <p className="text-xs text-gray-500">{avatarFile.name}</p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Basic fields */}
        <div className="card p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre completo</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Usuario</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="input pl-7"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Cuéntanos sobre ti..."
              className="input resize-none"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{bio.length}/300</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Santiago..." className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Instagram</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="tuusuario" className="input pl-7" />
            </div>
          </div>
        </div>

        {/* Dance styles */}
        <div className="card p-4 space-y-5">
          <StylesPicker
            label="Estilos que bailo"
            selected={stylesDancing}
            onChange={setStylesDancing}
          />
          <div className="border-t border-gray-100 pt-5">
            <StylesPicker
              label="Estilos que enseño"
              selected={stylesTaching}
              onChange={setStylesTeaching}
            />
            <p className="mt-2 text-xs text-gray-400">Solo si enseñas — aparecerá en tu perfil público</p>
          </div>
        </div>

        {/* Privacy */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Clases inscritas públicas</p>
              <p className="text-xs text-gray-500 mt-0.5">Otros usuarios pueden ver en qué clases estás inscrito</p>
            </div>
            <button
              type="button"
              onClick={() => setEnrolledPublic(!enrolledPublic)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                enrolledPublic
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              {enrolledPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {enrolledPublic ? 'Público' : 'Privado'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full py-3">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
