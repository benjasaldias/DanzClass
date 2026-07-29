import type { StyleProp, ViewStyle } from 'react-native'

export {}

declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string
    stroke?: string
    style?: StyleProp<ViewStyle>
  }
}
