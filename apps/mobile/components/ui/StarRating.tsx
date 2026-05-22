import { View, Text, TouchableOpacity } from 'react-native'

const YELLOW = '#EAB308'
const EMPTY = '#D1D5DB'

interface StarRatingProps {
  value: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  onChange?: (stars: number) => void
}

const FONT_SIZES = { sm: 13, md: 17, lg: 24 }
const STAR_SIZES = { sm: 16, md: 22, lg: 30 }

export default function StarRating({ value, count, size = 'md', interactive, onChange }: StarRatingProps) {
  const isInteractive = interactive || !!onChange
  const fontSize = FONT_SIZES[size]
  const starSize = STAR_SIZES[size]

  if (!isInteractive) {
    if (!count || count === 0) return null
    return (
      <Text style={{ color: YELLOW, fontWeight: 'bold', fontSize }}>
        ★ {value.toFixed(1)}{' '}
        <Text style={{ color: '#6B6880', fontWeight: 'normal', fontSize: fontSize - 1 }}>
          ({count})
        </Text>
      </Text>
    )
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange?.(star)} activeOpacity={0.6}>
          <Text style={{ fontSize: starSize, color: value >= star ? YELLOW : EMPTY, fontWeight: 'bold' }}>
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
