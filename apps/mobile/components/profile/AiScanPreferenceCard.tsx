import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Sparkles, Eye, Check } from 'lucide-react-native'
import { getAiScanDisclaimer, type AiScanPreference } from '@danceclass/shared'
import { supabase } from '../../lib/supabase'

interface Props {
  userId: string
  initialPreference: AiScanPreference | null
  isDark: boolean
}

const OPTIONS: { value: AiScanPreference; icon: any; title: string; sub: string }[] = [
  {
    value: 'ai',
    icon: Sparkles,
    title: 'IA escanea automáticamente',
    sub: 'La IA revisa cada comprobante al recibirlo y te avisa si encuentra algo raro.',
  },
  {
    value: 'manual',
    icon: Eye,
    title: 'Reviso manualmente',
    sub: 'Tú revisas y confirmas cada comprobante como hasta ahora, sin ayuda de IA.',
  },
]

export default function AiScanPreferenceCard({ userId, initialPreference, isDark }: Props) {
  const [preference, setPreference] = useState<AiScanPreference | null>(initialPreference)
  const [saving, setSaving] = useState<AiScanPreference | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  async function handleSelect(value: AiScanPreference) {
    if (value === preference || saving) return
    const previous = preference
    setPreference(value)
    setSaving(value)
    setError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ai_scan_preference: value } as any)
      .eq('id', userId)

    setSaving(null)

    if (updateError) {
      setPreference(previous)
      setError('No se pudo guardar tu preferencia. Intenta de nuevo.')
      return
    }

    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <View className="px-4 pb-4">
      {preference === null && (
        <View
          className="mb-2 self-start rounded-full px-2.5 py-1"
          style={{ backgroundColor: isDark ? '#3A1713' : '#FBE6E3' }}
        >
          <Text className="text-[11px] font-semibold" style={{ color: isDark ? '#FF9E7A' : '#D85A30' }}>
            Aún no configurado
          </Text>
        </View>
      )}

      <View className="gap-2">
        {OPTIONS.map(({ value, icon: Icon, title, sub }) => {
          const isSelected = preference === value
          return (
            <View key={value}>
              <TouchableOpacity
                onPress={() => handleSelect(value)}
                disabled={saving !== null}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  borderWidth: 2,
                  borderColor: isSelected ? '#7F77DD' : (isDark ? '#3D2870' : '#e5e7eb'),
                  backgroundColor: isSelected ? (isDark ? '#2E1B5C' : '#F2F1FD') : (isDark ? '#241547' : '#fff'),
                  opacity: saving !== null && saving !== value ? 0.6 : 1,
                }}
              >
                <Icon size={18} stroke={isSelected ? '#7F77DD' : (isDark ? '#A39BBF' : '#9ca3af')} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-dark-text">{title}</Text>
                  <Text className="mt-0.5 text-xs leading-4 text-gray-500 dark:text-dark-text2">{sub}</Text>
                </View>
                {saving === value ? (
                  <ActivityIndicator size="small" color="#7F77DD" />
                ) : isSelected ? (
                  <Check size={18} stroke="#7F77DD" />
                ) : null}
              </TouchableOpacity>

              {value === 'ai' && (
                <Text className="mt-1.5 px-1 text-[11px] leading-4 text-gray-400 dark:text-dark-text2">
                  {getAiScanDisclaimer('es')}
                </Text>
              )}
            </View>
          )
        })}
      </View>

      {savedFlash && (
        <Text className="mt-2 px-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Preferencia guardada</Text>
      )}
      {error && <Text className="mt-2 px-1 text-[11px] text-red-500 dark:text-red-400">{error}</Text>}
    </View>
  )
}
