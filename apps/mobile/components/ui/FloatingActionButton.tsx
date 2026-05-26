import { TouchableOpacity, StyleSheet } from 'react-native'
import { Plus } from 'lucide-react-native'

interface FloatingActionButtonProps {
  onPress: () => void
}

export default function FloatingActionButton({ onPress }: FloatingActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.fab}
    >
      <Plus size={26} stroke="white" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#c026d3',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#c026d3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
})
