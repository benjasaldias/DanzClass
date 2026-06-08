import { TouchableOpacity } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

interface FloatingActionButtonProps {
  onPress: () => void
}

/**
 * Botón flotante "Publicar" — vidrio translúcido, esquina inferior derecha,
 * sobre el ítem "Perfil" del tab bar.
 */
export default function FloatingActionButton({ onPress }: FloatingActionButtonProps) {
  const { isDark } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        position: 'absolute',
        bottom: 24,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(46,27,92,0.78)' : 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.65)',
        elevation: 6,
        shadowColor: isDark ? '#000' : '#2D1B69',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.5 : 0.25,
        shadowRadius: 10,
      }}
    >
      <Plus size={26} stroke={isDark ? '#B3A6F8' : '#2D1B69'} />
    </TouchableOpacity>
  )
}
