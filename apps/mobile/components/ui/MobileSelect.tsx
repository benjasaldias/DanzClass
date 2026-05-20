import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronDown, Check, X } from 'lucide-react-native'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  label?: string
  value: string
  options: SelectOption[]
  onSelect: (value: string) => void
  placeholder?: string
  error?: string
  nullable?: boolean
}

export default function MobileSelect({ label, value, options, onSelect, placeholder = 'Seleccionar', error, nullable }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <View>
        {label && <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">{label}</Text>}
        <TouchableOpacity
          onPress={() => setOpen(true)}
          className={`border rounded-xl px-3 py-2.5 flex-row items-center justify-between bg-white dark:bg-dark-surface2 ${error ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
        >
          <Text className={`text-sm ${selected ? 'text-gray-900 dark:text-dark-text' : 'text-gray-400 dark:text-dark-text2/60'}`}>
            {selected ? selected.label : placeholder}
          </Text>
          <ChevronDown size={16} stroke="#9CA3AF" />
        </TouchableOpacity>
        {error && <Text className="text-xs text-red-600 mt-1">{error}</Text>}
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white dark:bg-dark-surface" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-border">
            <Text className="text-base font-bold text-gray-900 dark:text-dark-text">{label ?? 'Seleccionar'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <X size={22} stroke="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {nullable && (
            <TouchableOpacity
              onPress={() => { onSelect(''); setOpen(false) }}
              className="flex-row items-center px-4 py-3.5 border-b border-gray-50 dark:border-dark-border/40"
            >
              <Text className="text-sm text-gray-400 dark:text-dark-text2/60 italic">Sin especificar</Text>
            </TouchableOpacity>
          )}
          <FlatList
            data={options}
            keyExtractor={(item: SelectOption) => item.value}
            renderItem={({ item }: { item: SelectOption }) => (
              <TouchableOpacity
                onPress={() => { onSelect(item.value); setOpen(false) }}
                className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-50 dark:border-dark-border/40"
              >
                <Text className={`text-sm ${item.value === value ? 'text-violeta-oscuro dark:text-brand-300 font-semibold' : 'text-gray-800 dark:text-dark-text'}`}>
                  {item.label}
                </Text>
                {item.value === value && <Check size={16} stroke="#534AB7" />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  )
}
