import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, Video, X, Globe, Lock, Users, Clapperboard, ChevronDown } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { isCloudinaryConfigured, uploadVideoToCloudinary } from '../../../lib/cloudinary'

type Visibility = 'public' | 'followers' | 'friends'

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'followers', label: 'Seguidores', icon: Lock },
  { value: 'friends', label: 'Amigos', icon: Users },
]

export default function CreatePostScreen() {
  const router = useRouter()
  const { isDark } = useTheme()

  const [userId, setUserId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [videoUri, setVideoUri] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [enrolledClasses, setEnrolledClasses] = useState<{ id: string; title: string }[]>([])
  const [showClassPicker, setShowClassPicker] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await (supabase as any)
        .from('enrollments')
        .select('class:classes!class_id(id, title)')
        .eq('student_id', user.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(30)
      if (data) {
        const unique = new Map<string, string>()
        for (const e of data) {
          if (e.class?.id && e.class?.title) unique.set(e.class.id, e.class.title)
        }
        setEnrolledClasses(Array.from(unique.entries()).map(([id, title]) => ({ id, title })))
      }
    }
    load()
  }, [])

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitas dar acceso a tu galería para seleccionar videos.')
      return
    }
    if (permission.accessPrivileges === 'limited') {
      Alert.alert(
        'Acceso limitado a Fotos',
        'Para seleccionar videos ve a Configuración > Expo Go > Fotos y elige "Acceso completo".',
        [{ text: 'OK' }]
      )
      return
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      setVideoUri(result.assets[0].uri)
    } catch {
      Alert.alert('Error de acceso', 'No se pudo abrir la galería. Ve a Configuración > Expo Go > Fotos y elige "Acceso completo".')
    }
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
          url = await uploadVideoToCloudinary(videoUri, 'posts')
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
        description: description.trim() || null,
        video_url: url,
        is_public: visibility === 'public',
        visibility,
        class_id: classId || null,
      } as any)

    setLoading(false)

    if (insertErr) {
      // posts_plan_quota_guard rechaza publicar sin plan activo (el insert va
      // directo del cliente a la DB, ver 060_post_plan_visibility.sql).
      setError(
        insertErr.message?.includes('plan_required_for_posts')
          ? 'Publicar videos requiere un plan activo.'
          : 'Error al publicar. Intenta de nuevo.'
      )
      return
    }

    router.replace('/(app)/(tabs)/feed' as any)
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={24} stroke={isDark ? '#EEEDFE' : '#374151'} />
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

        {/* Description */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
            Descripción <Text className="font-normal text-gray-400">(opcional)</Text>
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 280))}
            placeholder="¿De qué trata este video? Contexto, estilo, nivel..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            className="border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2"
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          <Text className="text-xs text-gray-400 dark:text-dark-text2/60 text-right">{description.length}/280</Text>
        </View>

        {/* Class tag */}
        {enrolledClasses.length > 0 && (
          <View className="gap-1.5">
            <View className="flex-row items-center gap-1.5">
              <Clapperboard size={14} stroke="#7F77DD" />
              <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2">
                Clase relacionada <Text className="font-normal text-gray-400">(opcional)</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowClassPicker(true)}
              className="flex-row items-center justify-between border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2.5 bg-white dark:bg-dark-surface2"
            >
              <Text className={`text-sm ${classId ? 'text-gray-900 dark:text-dark-text' : 'text-gray-400 dark:text-dark-text2/60'}`}>
                {classId ? (enrolledClasses.find((c) => c.id === classId)?.title ?? 'Sin etiquetar') : 'Sin etiquetar'}
              </Text>
              <ChevronDown size={16} stroke={isDark ? '#A39BBF' : '#9CA3AF'} />
            </TouchableOpacity>
          </View>
        )}

        {/* Class picker modal */}
        <Modal visible={showClassPicker} transparent animationType="slide" onRequestClose={() => setShowClassPicker(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowClassPicker(false)}
          >
            <View
              className="bg-white dark:bg-dark-surface rounded-t-2xl"
              style={{ maxHeight: 400 }}
              onStartShouldSetResponder={() => true}
            >
              <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-dark-border">
                <Text className="text-base font-bold text-gray-900 dark:text-dark-text">Seleccionar clase</Text>
                <TouchableOpacity onPress={() => setShowClassPicker(false)}>
                  <X size={20} stroke={isDark ? '#EEEDFE' : '#374151'} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={[{ id: '', title: 'Sin etiquetar' }, ...enrolledClasses]}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => { setClassId(item.id || null); setShowClassPicker(false) }}
                    className="px-4 py-3.5 border-b border-gray-50 dark:border-dark-border"
                    style={{ backgroundColor: classId === (item.id || null) ? (isDark ? '#2E1B5C' : '#F5F3FF') : undefined }}
                  >
                    <Text className={`text-sm ${classId === (item.id || null) ? 'text-[#7F77DD] font-semibold' : 'text-gray-700 dark:text-dark-text2'}`}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>

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
