'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  onChange?: (stars: number) => void
  className?: string
}

export default function StarRating({ value, count, size = 'md', interactive, onChange, className }: StarRatingProps) {
  const [hovered, setHovered] = useState(0)
  const isInteractive = interactive || !!onChange

  if (!isInteractive) {
    if (!count || count === 0) return null
    const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }
    return (
      <span className={cn('text-yellow-500 font-semibold', textSizes[size], className)}>
        ★ {value.toFixed(1)}{' '}
        <span className="text-gray-400 dark:text-dark-text2 font-normal">({count} valoraciones)</span>
      </span>
    )
  }

  const starSizes = { sm: 'text-xl', md: 'text-3xl', lg: 'text-4xl' }

  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onClick={() => onChange?.(star)}
          className={cn(
            'leading-none transition-colors cursor-pointer select-none',
            starSizes[size],
            (hovered || value) >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-dark-border'
          )}
        >
          ★
        </button>
      ))}
    </div>
  )
}
