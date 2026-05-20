import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, Video, X, Globe, Lock, Users } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'

type Visibility = 'public' | 'followers' | 'friends'

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'followers', label: 'Seguidores', icon: Lock },
  { value: 'friends', label: 'Amigos', icon: Users },
]

function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  )
}

async function uploadToCloudinary(uri: string): Promise<string> {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME!
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET!

  const formData = new FormData()
  formData.append('file', { uri, type: 'video/mp4', name: 'video.mp4' } as any)
  formData.append('upload_preset', uploadPreset)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    { method: 'POST', body: formData }
  )
  const result = await response.json()
  if (!result.secure_url) throw new Error('Cloudinary upload failed')
  return result.secure_url
}

export default function CreatePostScreen() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [userCity, setUserCity] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [city, setCity] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('city').eq('id', user.id).single()
      const c = data?.city ?? ''
      setUserCity(c)
      setCity(c)
    }
    load()
  }, [])

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setVideoUri(result.assets[0].uri)
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Escribe un título'); return }
    if (!userId) return
    setLoading(true)
    setError(null)

    let url: string | null = null

    if (videoUri) {
      try {
        if (isCloudinaryConfigured()) {
          url = await uploadToCloudinary(videoUri)
        } else {
          const ext = videoUri.split('.').pop() ?? 'mp4'
          const path = `${userId}/${Date.now()}.${ext}`
          const response = await fetch(videoUri)
          const blob = await response.blob()
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('posts-media')
            .upload(path, blob, { contentType: 'video/mp4' })
          if (uploadErr || !uploadData) throw new Error('upload_failed')
          const { data: urlData } = supabase.storage.from('posts-media').getPublicUrl(uploadData.path)
          url = urlData.publicUrl
        }
      } catch {
        setError('Error al subir el video. Intenta de nuevo.')
        setLoading(false)
        return
      }
    }

    const { error: insertErr } = await (supabase as any)
      .from('posts')
      .insert({
        user_id: userId,
        title: title.trim(),
        video_url: url,
        is_public: visibility === 'public',
        visibility,
        city: city.trim() || null,
      } as any)

    setLoading(false)

    if (insertErr) {
      setError('Error al publicar. Intenta de nuevo.')
      return
    }

    router.replace('/(app)/(tabs)/feed' as any)
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 dark:text-dark-text">Nueva coreografía</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* Title */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Título *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="ej: Combo de Salsa — nivel básico"
            placeholderTextColor="#9CA3AF"
            maxLength={120}
            className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
          />
        </View>

        {/* Video picker */}
        {videoUri ? (
          <View className="bg-black rounded-xl overflow-hidden">
            <View className="items-center justify-center py-8">
              <Video size={40} stroke="#fff" />
              <Text className="text-white text-sm mt-2">Video seleccionado</Text>
            </View>
            <TouchableOpacity
              onPress={() => setVideoUri(null)}
              className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5"
            >
              <X size={16} stroke="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickVideo}
            className="border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl p-10 items-center gap-2"
          >
            <Video size={32} stroke="#9CA3AF" />
            <Text className="text-sm text-gray-500 dark:text-dark-text2">Seleccionar video</Text>
            <Text className="text-xs text-gray-400 dark:text-dark-text2/60">MP4, MOV</Text>
          </TouchableOpacity>
        )}

        {/* City */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Ciudad</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="ej: Santiago"
            placeholderTextColor="#9CA3AF"
            className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
          />
        </View>

        {/* Visibility */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">Visibilidad</Text>
          <View className="flex-row gap-2">
            {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = visibility === value
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setVisibility(value)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                    active ? 'bg-brand-50 border-brand-200' : 'bg-white dark:bg-dark-surface2 border-gray-200 dark:border-dark-border'
                  }`}
                >
                  <Icon size={14} stroke={active ? '#7e22ce' : '#9CA3AF'} />
                  <Text className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-gray-500 dark:text-dark-text2'}`}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          className="bg-brand-600 rounded-xl py-3.5 items-center mb-4"
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-base">Publicar coreografía</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
