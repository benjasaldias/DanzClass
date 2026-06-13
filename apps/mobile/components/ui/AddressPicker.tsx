import { useState, useRef, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Check } from 'lucide-react-native'
import type { GeocodeResult } from '@danceclass/shared'
import { geocodeSearch } from '../../lib/location'

interface Props {
  value: string
  /** coords are non-null only when a geocoded suggestion is chosen. */
  onChange: (address: string, coords: { lat: number; lng: number } | null) => void
  hasCoords?: boolean
  label?: string
}

/**
 * Chile-only address field with autocomplete (web geocode proxy).
 * Picking a suggestion returns its coordinates; free typing clears them.
 */
export default function AddressPicker({ value, onChange, hasCoords, label }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Keep a ref to the latest onChange to avoid stale-closure captures.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleChange(text: string) {
    setQuery(text)
    onChangeRef.current(text, null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < 3) {
      setResults([])
      setShow(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const geocodeResults = await geocodeSearch(text)
      if (!mountedRef.current) return
      setResults(geocodeResults)
      setShow(geocodeResults.length > 0)
      setLoading(false)
    }, 400)
  }

  function handleSelect(suggestion: GeocodeResult) {
    // Cancel any pending debounce so the dropdown doesn't reopen after selection.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(suggestion.address)
    onChangeRef.current(suggestion.address, { lat: suggestion.lat, lng: suggestion.lng })
    setResults([])
    setShow(false)
  }

  return (
    <View style={{ zIndex: 20 }}>
      {label && <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">{label}</Text>}
      <View className="flex-row items-center border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface2 px-3">
        <TextInput
          value={query}
          onChangeText={handleChange}
          onFocus={() => { if (results.length > 0) setShow(true) }}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder="ej: Av. Providencia 1234, Santiago"
          placeholderTextColor="#9CA3AF"
          className="flex-1 py-2.5 text-sm text-gray-900 dark:text-dark-text"
        />
        {loading ? (
          <ActivityIndicator size="small" color="#9CA3AF" />
        ) : hasCoords && query.trim().length > 0 ? (
          <Check size={16} color="#10b981" />
        ) : null}
      </View>
      {hasCoords && query.trim().length > 0 && (
        <Text className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Ubicación encontrada en el mapa ✓</Text>
      )}
      {show && results.length > 0 && (
        <View
          className="absolute left-0 right-0 bg-white dark:bg-dark-surface2 border border-gray-200 dark:border-dark-border rounded-xl shadow-md overflow-hidden"
          style={{ top: label ? 76 : 48, zIndex: 100 }}
        >
          {results.map((suggestion, idx) => (
            <TouchableOpacity
              key={`${suggestion.lat},${suggestion.lng},${idx}`}
              onPress={() => handleSelect(suggestion)}
              className="px-3 py-2.5 border-b border-gray-50 dark:border-dark-border/40"
            >
              <Text className="text-sm text-gray-800 dark:text-dark-text">{suggestion.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}
