import React from 'react'
import { View, Text, TouchableWithoutFeedback } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
const FILLED_COLOR = '#c026d3'
const EMPTY_COLOR = '#d1d5db'

interface StarProps {
  fillValue: number // 0 = empty, 0.5 = half, 1 = full
  size: number
  gradId: string
}

function StarIcon({ fillValue, size, gradId }: StarProps) {
  const fillPercent = Math.round(fillValue * 100)
  const strokeColor = fillValue > 0 ? FILLED_COLOR : EMPTY_COLOR

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset={`${fillPercent}%`} stopColor={FILLED_COLOR} />
          <Stop offset={`${fillPercent}%`} stopColor={EMPTY_COLOR} />
        </LinearGradient>
      </Defs>
      <Path
        d={STAR_PATH}
        fill={`url(#${gradId})`}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  readOnly?: boolean
  showCount?: boolean
  count?: number
  instanceId?: string
}

const SIZES = { sm: 14, md: 20, lg: 28 }

export default function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
  showCount,
  count,
  instanceId = 'default',
}: StarRatingProps) {
  const px = SIZES[size]
  const isInteractive = !readOnly && !!onChange

  function handlePress(starIndex: number, isLeft: boolean) {
    if (!isInteractive) return
    onChange!(isLeft ? starIndex + 0.5 : starIndex + 1)
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fillValue = value >= i + 1 ? 1 : value >= i + 0.5 ? 0.5 : 0
        const gradId = `star-${instanceId}-${i}`

        if (!isInteractive) {
          return (
            <View key={i}>
              <StarIcon fillValue={fillValue} size={px} gradId={gradId} />
            </View>
          )
        }

        return (
          <View key={i} style={{ flexDirection: 'row' }}>
            {/* Left half tap = half star */}
            <TouchableWithoutFeedback onPress={() => handlePress(i, true)}>
              <View style={{ width: px / 2, height: px, overflow: 'hidden' }}>
                <StarIcon fillValue={fillValue} size={px} gradId={`${gradId}-l`} />
              </View>
            </TouchableWithoutFeedback>
            {/* Right half tap = full star */}
            <TouchableWithoutFeedback onPress={() => handlePress(i, false)}>
              <View style={{ width: px / 2, height: px, overflow: 'hidden', alignItems: 'flex-end' }}>
                <View style={{ width: px, marginLeft: -(px / 2) }}>
                  <StarIcon fillValue={fillValue} size={px} gradId={`${gradId}-r`} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        )
      })}
      {showCount && count !== undefined && (
        <Text style={{ fontSize: 11, color: '#6B6880', marginLeft: 2 }}>({count})</Text>
      )}
    </View>
  )
}
