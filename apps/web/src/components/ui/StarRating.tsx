'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

interface StarIconProps {
  fillValue: number // 0 = empty, 0.5 = half, 1 = full
  size: number
  gradId: string
}

function StarIcon({ fillValue, size, gradId }: StarIconProps) {
  const fillPercent = Math.round(fillValue * 100)
  const filledColor = '#c026d3'
  const emptyColor = '#d1d5db'
  const strokeColor = fillValue > 0 ? filledColor : emptyColor

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset={`${fillPercent}%`} stopColor={filledColor} />
          <stop offset={`${fillPercent}%`} stopColor={emptyColor} />
        </linearGradient>
      </defs>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={`url(#${gradId})`}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  readOnly?: boolean
  showCount?: boolean
  count?: number
  className?: string
}

export default function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
  showCount,
  count,
  className,
}: StarRatingProps) {
  const uid = useId()
  const [hoverValue, setHoverValue] = useState<number | null>(null)

  const displayValue = hoverValue ?? value
  const starSizes = { sm: 14, md: 18, lg: 24 }
  const px = starSizes[size]
  const isInteractive = !readOnly && !!onChange

  function getValueFromMouse(e: React.MouseEvent<HTMLDivElement>, starIndex: number): number {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    return x < rect.width / 2 ? starIndex + 0.5 : starIndex + 1
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>, starIndex: number) {
    if (!isInteractive) return
    setHoverValue(getValueFromMouse(e, starIndex))
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>, starIndex: number) {
    if (!isInteractive) return
    onChange!(getValueFromMouse(e, starIndex))
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fillValue = displayValue >= i + 1 ? 1 : displayValue >= i + 0.5 ? 0.5 : 0
        return (
          <div
            key={i}
            onMouseMove={(e) => handleMouseMove(e, i)}
            onClick={(e) => handleClick(e, i)}
            onMouseLeave={() => isInteractive && setHoverValue(null)}
            style={{ cursor: isInteractive ? 'pointer' : 'default' }}
          >
            <StarIcon fillValue={fillValue} size={px} gradId={`${uid}-star-${i}`} />
          </div>
        )
      })}
      {showCount && count !== undefined && (
        <span className="text-xs text-gray-500 dark:text-dark-text2 ml-1">({count})</span>
      )}
    </div>
  )
}
