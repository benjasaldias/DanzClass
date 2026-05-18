import { useState, useEffect } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import MobileClassCard from '../../../components/feed/MobileClassCard'
import type { Profile } from '@danceclass/shared'

export default function ExploreScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'classes' | 'teachers'>('classes')
  const [query, setQuery] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? '')

      const [classRes, teacherRes] = await Promise.all([
        supabase.from('classes').select('*, teacher:profiles!teacher_id(*), media:class_media(*)').eq('status', 'active').order('created_at', { ascending: false }).limit(30),
        supabase.from('profiles').select('*').eq('role', 'teacher').order('created_at', { ascending: false }),
      ])
      setClasses(classRes.data ?? [])
      setTeachers(teacherRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredClasses = classes.filter((c) =>
    !query || c.title.toLowerCase().includes(query.toLowerCase()) || c.dance_style?.toLowerCase().includes(query.toLowerCase())
  )
  const filteredTeachers = teachers.filter((t) =>
    !query || t.full_name.toLowerCase().includes(query.toLowerCase()) || t.username.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta">
      <View className="px-4 py-3 border-b border-gray-100 gap-2">
        <Text className="text-xl font-bold text-gray-900">Explorar</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar clases o profesores..."
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
        />
        <View className="flex-row gap-2">
          {(['classes', 'teachers'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 rounded-full py-1.5 items-center ${tab === t ? 'bg-brand-600' : 'bg-gray-100'}`}
            >
              <Text className={`text-sm font-medium ${tab === t ? 'text-white' : 'text-gray-600'}`}>
                {t === 'classes' ? 'Clases' : 'Profesores'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c026d3" />
        </View>
      ) : tab === 'classes' ? (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MobileClassCard classData={item} currentUserId={userId} />}
          ListEmptyComponent={<View className="py-12 items-center"><Text className="text-gray-500 text-sm">Sin resultados</Text></View>}
        />
      ) : (
        <FlatList
          data={filteredTeachers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item: teacher }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/teacher/${teacher.username}` as any)}
              className="flex-row items-center gap-3 bg-white rounded-2xl p-4 border border-gray-100"
            >
              <View className="w-12 h-12 rounded-full bg-brand-100 items-center justify-center">
                <Text className="text-brand-700 font-bold">
                  {teacher.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">{teacher.full_name}</Text>
                <Text className="text-xs text-gris-humo">@{teacher.username}</Text>
                {teacher.city && <Text className="text-xs text-gray-400">{teacher.city}</Text>}
              </View>
              <Text className="text-gray-300 text-lg">›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
