import Svg, { Rect, G } from 'react-native-svg'

interface LogoIconProps {
  size?: number
  color?: string
}

export default function LogoIcon({ size = 24, color = '#c026d3' }: LogoIconProps) {
  return (
    <Svg viewBox="0 0 1024 1024" width={size} height={size} accessibilityLabel="DanzClass">
      <G fill={color}>
        {/* Vertical stem */}
        <Rect x="373.357" y="113.445" width="115.471" height="678.810" />
        {/* Top horizontal bar */}
        <Rect x="375.308" y="113.152" width="440.746" height="91.634" />
        {/* Second horizontal bar */}
        <Rect x="375.273" y="246.562" width="410.956" height="91.634" />
        {/* Right vertical accent (rotated) */}
        <Rect
          x="112.017"
          y="-827.787"
          width="377.065"
          height="108.636"
          transform="matrix(-0.00361895,0.99999345,-0.99999892,-0.00146838,0,0)"
        />
      </G>
    </Svg>
  )
}
