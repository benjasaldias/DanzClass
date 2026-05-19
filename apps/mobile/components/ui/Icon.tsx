import { type LucideIcon } from 'lucide-react-native'

export const ICON_COLORS = {
  secondary: '#6B6880',  // gris-humo — iconos secundarios, empty states
  active: '#c026d3',     // brand-600 — iconos activos, acento de marca
}

interface IconProps {
  icon: LucideIcon
  size?: number
  variant?: keyof typeof ICON_COLORS
  stroke?: string
}

export function Icon({ icon: I, size = 20, variant = 'secondary', stroke }: IconProps) {
  return <I size={size} stroke={stroke ?? ICON_COLORS[variant]} />
}
