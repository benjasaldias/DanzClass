import { View, Text } from 'react-native'
import { styleColor } from '@danceclass/shared'
import { useTheme } from '../../context/ThemeContext'

interface StyleChipProps {
  style: string
  sub?: string | null
  size?: 'xs' | 'sm'
}

/**
 * Pill de estilo de baile con su acento cromático propio. Resuelve el color
 * según el tema activo (isDark) y lo aplica vía estilo inline.
 */
export default function StyleChip({ style, sub, size = 'sm' }: StyleChipProps) {
  const { isDark } = useTheme()
  const c = styleColor(style, isDark)
  return (
    <View
      style={{
        backgroundColor: c.soft,
        borderRadius: 999,
        paddingHorizontal: size === 'xs' ? 8 : 10,
        paddingVertical: size === 'xs' ? 2 : 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: c.ink, fontSize: size === 'xs' ? 10 : 11, fontWeight: '700' }}>
        {style}{sub ? ` · ${sub}` : ''}
      </Text>
    </View>
  )
}
