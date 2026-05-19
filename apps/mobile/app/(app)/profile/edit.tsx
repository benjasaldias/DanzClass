import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, Camera, Eye, EyeOff } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { DANCE_STYLES, CHILEAN_CITIES } from '@danceclass/shared'
import MobileSelect from '../../../components/ui/MobileSelect'

const CITY_OPTIONS = (CHILEAN_CITIES as readonly string[]).map((c) => ({ value: c, label: c }))
const DANCE_STYLE_LIST = DANCE_STYLES as readonly string[]

function StylesPicker({
  label, selected, onChange,
}: { label: string; selected: string[]; onChange: (s: string[]) => void }) {
  function toggle(style: string) {
    if (selected.includes(style)) onChange(selected.filter((s) => s !== style))
    else onChange([...selected, style])
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-gray-700">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {DANCE_STYLE_LIST.map((s) => {
          const active = selected.includes(s)
          return (
            <TouchableOpacity
              key={s}
              onPress={() => toggle(s)}
              className={`rounded-full px-3 py-1.5 border ${active ? 'bg-brand-600 border-brand-600' : 'bg-white border-gray-200'}`}
            >
              <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export default function EditProfileScreen() {
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [instagram, setInstagram] = useState('')
  const [stylesDancing, setStylesDancing] = useState<string[]>([])
  const [stylesTeaching, setStylesTeaching] = useState<string[]>([])
  const [enrolledPublic, setEnrolledPublic] = useState(true)

  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [avatarChanged, setAvatarChanged] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!data) return
      setProfile(data)
      setFullName(data.full_name ?? '')
      setUsername(data.username ?? '')
      setBio(data.bio ?? '')
      setCity(data.city ?? '')
      setInstagram(data.instagram_handle ?? '')
      setStylesDancing(data.styles_dancing ?? [])
      setStylesTeaching(data.styles_teaching ?? [])
      setEnrolledPublic(data.enrolled_classes_public ?? true)
      setAvatarUri(data.avatar_url ?? null)
      setLoading(false)
    }
    load()
  }, [])

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setAvatarUri(result.assets[0].uri)
    setAvatarChanged(true)
  }

  async function handleSave() {
    if (!profile) return
    if (!fullName.trim()) { setError('El nombre es requerido'); return }
    if (!username.trim()) { setError('El usuario es requerido'); return }

    setSaving(true)
    setError(null)

    let avatarUrl = profile.avatar_url

    if (avatarChanged && avatarUri) {
      try {
        const ext = avatarUri.split('.').pop() ?? 'jpg'
        const path = `${profile.id}/avatar.${ext}`
        const response = await fetch(avatarUri)
        const blob = await response.blob()
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

        if (uploadErr) {
          setError('Error al subir la foto de perfil')
          setSaving(false)
          return
        }
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(uploadData.path)
        avatarUrl = urlData.publicUrl
      } catch {
        setError('Error al subir la foto de perfil')
        setSaving(false)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        bio: bio.trim() || null,
        city: city.trim() || null,
        instagram_handle: instagram.trim().replace(/^@/, '') || null,
        avatar_url: avatarUrl,
        styles_dancing: stylesDancing,
        styles_teaching: stylesTeaching,
        enrolled_classes_public: enrolledPublic,
      })
      .eq('id', profile.id)

    setSaving(false)

    if (updateError) {
      if (updateError.message.includes('unique') || updateError.message.includes('duplicate')) {
        setError('Ese nombre de usuario ya está en uso')
      } else {
        setError(updateError.message)
      }
      return
    }

    router.back()
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-blanco-violeta items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#c026d3" />
      </SafeAreaView>
    )
  }

  const initials = (fullName || '')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">Editar perfil</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* Avatar */}
        <View className="items-center">
          <View className="relative">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} className="w-24 h-24 rounded-full" />
            ) : (
              <View className="w-24 h-24 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 text-2xl font-bold">{initials}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={pickAvatar}
              className="absolute bottom-0 right-0 bg-brand-600 w-8 h-8 rounded-full items-center justify-center"
            >
              <Camera size={16} stroke="white" />
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {/* Basic info */}
        <View className="bg-white border border-gray-100 rounded-xl p-4 gap-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">Nombre completo</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">Usuario</Text>
            <View className="flex-row items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
              <Text className="text-gray-400 text-sm mr-0.5">@</Text>
              <TextInput
                value={username}
                onChangeText={(t: string) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="flex-1 text-sm text-gray-900"
                autoCapitalize="none"
              />
            </View>
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
              maxLength={300}
              placeholder="Cuéntanos sobre ti..."
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
              style={{ minHeight: 72 }}
            />
            <Text className="text-right text-xs text-gray-400">{bio.length}/300</Text>
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">Ciudad</Text>
            <MobileSelect
              value={city}
              options={CITY_OPTIONS}
              onSelect={setCity}
              placeholder="Seleccionar ciudad"
              nullable
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">Instagram</Text>
            <View className="flex-row items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white">
              <Text className="text-gray-400 text-sm mr-0.5">@</Text>
              <TextInput
                value={instagram}
                onChangeText={setInstagram}
                placeholder="tuusuario"
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-sm text-gray-900"
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>

        {/* Dance styles */}
        <View className="bg-white border border-gray-100 rounded-xl p-4 gap-5">
          <StylesPicker label="Estilos que bailo" selected={stylesDancing} onChange={setStylesDancing} />
          <View className="border-t border-gray-100 pt-4">
            <StylesPicker label="Estilos que enseño" selected={stylesTeaching} onChange={setStylesTeaching} />
            <Text className="text-xs text-gray-400 mt-2">Solo si enseñas — aparecerá en tu perfil público</Text>
          </View>
        </View>

        {/* Privacy */}
        <View className="bg-white border border-gray-100 rounded-xl p-4 flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Clases inscritas públicas</Text>
            <Text className="text-xs text-gray-500 mt-0.5">Otros usuarios pueden ver en qué clases estás inscrito</Text>
          </View>
          <TouchableOpacity
            onPress={() => setEnrolledPublic(!enrolledPublic)}
            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${
              enrolledPublic ? 'bg-brand-50 border-brand-200' : 'bg-gray-100 border-gray-200'
            }`}
          >
            {enrolledPublic
              ? <Eye size={14} stroke="#7e22ce" />
              : <EyeOff size={14} stroke="#6B7280" />}
            <Text className={`text-xs font-medium ${enrolledPublic ? 'text-brand-700' : 'text-gray-500'}`}>
              {enrolledPublic ? 'Público' : 'Privado'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className="bg-brand-600 rounded-xl py-3.5 items-center mb-4"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Guardar cambios</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
