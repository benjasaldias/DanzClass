interface LogoIconProps {
  className?: string
}

export default function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      aria-label="DanzClass"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <g>
        {/* Vertical stem */}
        <rect x="373.357" y="113.445" width="115.471" height="678.810" />
        {/* Top horizontal bar */}
        <rect x="375.308" y="113.152" width="440.746" height="91.634" />
        {/* Second horizontal bar */}
        <rect x="375.273" y="246.562" width="410.956" height="91.634" />
        {/* Right vertical accent (rotated) */}
        <rect
          x="112.017"
          y="-827.787"
          width="377.065"
          height="108.636"
          transform="matrix(-0.00361895,0.99999345,-0.99999892,-0.00146838,0,0)"
        />
        {/* dc letterforms */}
        <text
          x="44.117241"
          y="878.65533"
          style={{
            fontFamily: 'var(--font-sora), Sora, sans-serif',
            fontWeight: 700,
            fontSize: '708.319px',
            letterSpacing: 0,
          }}
          transform="scale(0.99629915,1.0037146)"
        >dc</text>
      </g>
    </svg>
  )
}
