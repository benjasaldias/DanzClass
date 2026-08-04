import type { StyleProp, ViewStyle } from 'react-native'

export {}

declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string
    stroke?: string
    /** Relleno del trazo — el corazón lleno del "me gusta" (PostActions). */
    fill?: string
    style?: StyleProp<ViewStyle>
  }
}
