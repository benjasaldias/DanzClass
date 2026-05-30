import { useState } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import type { EventType } from '@danceclass/shared'

const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: 'batalla', label: 'Batalla' },
  { key: 'masterclass', label: 'Masterclass' },
  { key: 'otro', label: 'Otro' },
]

export default function CreateEventScreen() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<EventType>('batalla')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [city, setCity] = useState('')
  const [hasSpots, setHasSpots] = useState(false)
  const [maxSpots, setMaxSpots] = useState('')
  const [hasEntry, setHasEntry] = useState(false)
  const [entryPrice, setEntryPrice] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!title.trim()) return Alert.alert('Error', 'El título es obligatorio')
    if (!eventDate.trim()) return Alert.alert('Error', 'La fecha es obligatoria (YYYY-MM-DD)')
    if (hasSpots && (!maxSpots || Number(maxSpots) < 1)) return Alert.alert('Error', 'Ingresa número de cupos válido')
    if (hasEntry && (!entryPrice || Number(entryPrice) < 0)) return Alert.alert('Error', 'Ingresa precio de entrada válido')

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { data: ev, error } = await (supabase as any)
        .from('events')
        .insert({
          creator_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          event_type: eventType,
          event_date: eventDate.trim(),
          event_time: eventTime.trim() || null,
          city: city.trim() || null,
          has_spots: hasSpots,
          max_spots: hasSpots ? Number(maxSpots) : null,
          has_entry: hasEntry,
          entry_price: hasEntry ? Number(entryPrice) : null,
        })
        .select('id')
        .single()

      if (error) throw error
      router.replace(`/(app)/event/${ev.id}` as any)
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo crear el evento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-blanco-violeta dark:bg-dark-bg" edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-brand-600 dark:text-brand-400 font-medium">Cancelar</Text>
          </TouchableOpacity>
          <Text className="flex-1 font-bold text-lg text-gray-900 dark:text-dark-text">Crear evento</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={loading}
            className="bg-brand-600 rounded-xl px-4 py-2"
          >
            <Text className="text-white font-semibold text-sm">{loading ? '...' : 'Crear'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Type */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-2">Tipo de evento</Text>
          <View className="flex-row gap-2 mb-5">
            {EVENT_TYPES.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setEventType(key)}
                className={`px-4 py-2 rounded-xl border ${eventType === key ? 'bg-brand-600 border-brand-600' : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border'}`}
              >
                <Text className={eventType === key ? 'text-white font-semibold text-sm' : 'text-gray-700 dark:text-dark-text text-sm'}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Título *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="ej. Batalla de House 2v2"
            placeholderTextColor="#9CA3AF"
            maxLength={100}
            className="input mb-4 text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3"
          />

          {/* Description */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Descripción</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Cuéntales de qué va el evento..."
            placeholderTextColor="#9CA3AF"
            maxLength={800}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 mb-4"
            style={{ minHeight: 100 }}
          />

          {/* Date */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Fecha * (YYYY-MM-DD)</Text>
          <TextInput
            value={eventDate}
            onChangeText={setEventDate}
            placeholder="2026-07-15"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className="text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 mb-4"
          />

          {/* Time */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Hora (HH:MM, opcional)</Text>
          <TextInput
            value={eventTime}
            onChangeText={setEventTime}
            placeholder="19:00"
            placeholderTextColor="#9CA3AF"
            className="text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 mb-4"
          />

          {/* City */}
          <Text className="text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Ciudad</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Santiago"
            placeholderTextColor="#9CA3AF"
            className="text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 mb-4"
          />

          {/* Cupos */}
          <View className="border border-gray-200 dark:border-dark-border rounded-xl p-4 mb-4 bg-white dark:bg-dark-surface">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">Cupos limitados</Text>
                <Text className="text-xs text-gray-500 dark:text-dark-text2">Controla asistentes</Text>
              </View>
              <TouchableOpacity
                onPress={() => setHasSpots(!hasSpots)}
                className={`relative h-6 w-11 rounded-full ${hasSpots ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}
              >
                <View className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${hasSpots ? 'right-1' : 'left-1'}`} />
              </TouchableOpacity>
            </View>
            {hasSpots && (
              <TextInput
                value={maxSpots}
                onChangeText={setMaxSpots}
                placeholder="ej. 100"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                className="text-gray-900 dark:text-dark-text bg-gray-50 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-2 w-32"
              />
            )}
          </View>

          {/* Entrada */}
          <View className="border border-gray-200 dark:border-dark-border rounded-xl p-4 mb-8 bg-white dark:bg-dark-surface">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-gray-900 dark:text-dark-text">Entrada pagada</Text>
                <Text className="text-xs text-gray-500 dark:text-dark-text2">Asistentes pagan entrada</Text>
              </View>
              <TouchableOpacity
                onPress={() => setHasEntry(!hasEntry)}
                className={`relative h-6 w-11 rounded-full ${hasEntry ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}
              >
                <View className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${hasEntry ? 'right-1' : 'left-1'}`} />
              </TouchableOpacity>
            </View>
            {hasEntry && (
              <TextInput
                value={entryPrice}
                onChangeText={setEntryPrice}
                placeholder="ej. 5000"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                className="text-gray-900 dark:text-dark-text bg-gray-50 dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-2 w-40"
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
