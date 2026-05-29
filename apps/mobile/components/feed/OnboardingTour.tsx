import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Modal } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Users, MapPin, Clock, Sparkles, ChevronRight } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

const STORAGE_KEY = 'danzclass_onboarding_v1_seen'

const STEPS = [
  {
    Icon: Users,
    iconColor: '#c026d3',
    bg: 'bg-brand-50 dark:bg-brand-950/30',
    title: 'Sigue a tus profes favoritos',
    desc: 'Busca profesores en "Explorar" y síguelos para ver sus clases en tu feed de "Siguiendo".',
  },
  {
    Icon: MapPin,
    iconColor: '#7c3aed',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    title: 'Configura tu ciudad',
    desc: 'Agrega tu ciudad en tu perfil y activa el filtro "Cerca" para descubrir clases en tu zona.',
  },
  {
    Icon: Clock,
    iconColor: '#0284c7',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    title: 'Marca tus horarios libres',
    desc: 'En "Agenda" configura cuándo estás disponible. Podrás filtrar clases según tu disponibilidad.',
  },
  {
    Icon: Sparkles,
    iconColor: '#059669',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    title: '¡Empieza a inscribirte!',
    desc: 'Entra a cualquier clase, reserva tu cupo y sube tu comprobante. ¡Ya eres parte de la comunidad!',
  },
]

export default function OnboardingTour() {
  const { isDark } = useTheme()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) setVisible(true)
    }).catch(() => {})
  }, [])

  function dismiss() {
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {})
    setVisible(false)
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }

  const current = STEPS[step]
  const { Icon, iconColor } = current

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-black/50 justify-end pb-6 px-4">
        <View className={`rounded-2xl ${isDark ? 'bg-dark-surface' : 'bg-white'} overflow-hidden`}>
          {/* Progress dots */}
          <View className="flex-row justify-center gap-1.5 pt-4">
            {STEPS.map((_, i) => (
              <View
                key={i}
                className={`h-1.5 rounded-full ${i === step ? 'bg-brand-600' : isDark ? 'bg-dark-border' : 'bg-gray-200'}`}
                style={{ width: i === step ? 24 : 6 }}
              />
            ))}
          </View>

          {/* Content */}
          <View className="px-6 py-5 items-center gap-3">
            <View className={`h-14 w-14 rounded-2xl items-center justify-center ${current.bg}`}>
              <Icon size={28} stroke={iconColor} />
            </View>
            <Text className="text-lg font-bold text-gray-900 dark:text-dark-text text-center leading-tight">
              {current.title}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-dark-text2 text-center leading-relaxed">
              {current.desc}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row items-center gap-3 px-6 pb-6">
            <TouchableOpacity onPress={dismiss} className="flex-1 py-2 items-center">
              <Text className="text-sm text-gray-400 dark:text-dark-text2">Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={next}
              className="flex-[2] flex-row items-center justify-center gap-1.5 rounded-full bg-brand-600 py-2.5"
            >
              <Text className="text-white text-sm font-semibold">
                {step < STEPS.length - 1 ? 'Siguiente' : '¡Empezar!'}
              </Text>
              {step < STEPS.length - 1
                ? <ChevronRight size={16} stroke="white" />
                : <Sparkles size={16} stroke="white" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
