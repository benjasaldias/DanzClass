import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import { CHILEAN_CITIES } from '@danceclass/shared'

interface Props {
  value: string
  onChange: (city: string) => void
  label?: string
  error?: string
}

export default function MobileCityPicker({ value, onChange, label, error }: Props) {
  const [query, setQuery] = useState(value)
  const [showDropdown, setShowDropdown] = useState(false)

  const filtered = (CHILEAN_CITIES as readonly string[]).filter(
    (c) => c.toLowerCase().includes(query.toLowerCase()) && c.toLowerCase() !== query.toLowerCase()
  )

  function handleSelect(city: string) {
    setQuery(city)
    onChange(city)
    setShowDropdown(false)
  }

  function handleChange(text: string) {
    setQuery(text)
    onChange(text)
    setShowDropdown(text.length > 0 && filtered.length > 0)
  }

  return (
    <View style={{ zIndex: 10 }}>
      {label && <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">{label}</Text>}
      <TextInput
        value={query}
        onChangeText={handleChange}
        onFocus={() => { if (query.length > 0) setShowDropdown(true) }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="ej: Santiago"
        placeholderTextColor="#9CA3AF"
        className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${error ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
      />
      {error && <Text className="text-xs text-red-600 mt-1">{error}</Text>}
      {showDropdown && filtered.length > 0 && (
        <View
          className="absolute left-0 right-0 bg-white dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border rounded-xl shadow-md overflow-hidden"
          style={{ top: label ? 76 : 48, zIndex: 100 }}
        >
          {filtered.slice(0, 5).map((city) => (
            <TouchableOpacity
              key={city}
              onPress={() => handleSelect(city)}
              className="px-3 py-2.5 border-b border-gray-50 dark:border-dark-border/40"
            >
              <Text className="text-sm text-gray-800 dark:text-dark-text">{city}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}
