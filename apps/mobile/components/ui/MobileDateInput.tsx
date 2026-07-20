import { useState, useEffect } from 'react'
import { View, Text, TextInput } from 'react-native'

interface Props {
  value: string // YYYY-MM-DD or ''
  onChange: (iso: string) => void
  label?: string
  placeholder?: string
  error?: string
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayToIso(display: string): string {
  const parts = display.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts
  // Año de 2 dígitos (AA → 20AA) o de 4 (AAAA). El valor interno queda YYYY-MM-DD.
  if (y.length !== 2 && y.length !== 4) return ''
  const yyyy = y.length === 2 ? `20${y}` : y
  return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export default function MobileDateInput({ value, onChange, label, placeholder = 'DD/MM/AAAA', error }: Props) {
  const [display, setDisplay] = useState(isoToDisplay(value))

  useEffect(() => {
    // Solo re-sincroniza ante cambios EXTERNOS del value: si el value ya
    // corresponde a lo tecleado, no clobbear (evita romper el tipeo de un año
    // de 4 dígitos al commitear uno de 2, AA→20AA).
    if (displayToIso(display) === value) return
    const fromValue = isoToDisplay(value)
    if (fromValue !== display) setDisplay(fromValue)
  }, [value])

  function handleChange(text: string) {
    // Strip non-digits except allow deletion
    const raw = text.replace(/[^\d/]/g, '')
    const digits = raw.replace(/\//g, '')

    let formatted = digits
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    if (digits.length > 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8)

    setDisplay(formatted)

    // 6 dígitos (DD/MM/AA) o 8 (DD/MM/AAAA) → ISO. Si sigue escribiendo hasta 8,
    // el valor de 4 dígitos sobreescribe el de 2.
    if (digits.length === 8 || digits.length === 6) {
      onChange(displayToIso(formatted))
    } else {
      onChange('')
    }
  }

  return (
    <View>
      {label && <Text className="text-sm font-medium text-gray-700 dark:text-dark-text2 mb-1.5">{label}</Text>}
      <TextInput
        value={display}
        onChangeText={handleChange}
        placeholder={placeholder}
        keyboardType="numeric"
        maxLength={10}
        className={`border rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface2 ${error ? 'border-red-300' : 'border-gray-200 dark:border-dark-border'}`}
        placeholderTextColor="#9CA3AF"
      />
      {error && <Text className="text-xs text-red-600 mt-1">{error}</Text>}
    </View>
  )
}
