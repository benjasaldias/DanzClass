import { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAY_NAMES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']

interface Props {
  selected: string[] // YYYY-MM-DD
  onChange: (dates: string[]) => void
  disablePast?: boolean
}

export default function MobileMonthCalendar({ selected, onChange, disablePast }: Props) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today.toISOString().split('T')[0]

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  function toggleDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (disablePast && dateStr < todayStr) return
    if (selected.includes(dateStr)) {
      onChange(selected.filter((d) => d !== dateStr))
    } else {
      onChange([...selected, dateStr].sort())
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  return (
    <View className="bg-white border border-gray-200 rounded-xl p-3">
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity onPress={prevMonth} className="p-1">
          <ChevronLeft size={20} stroke="#374151" />
        </TouchableOpacity>
        <Text className="text-sm font-bold text-gray-900">{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} className="p-1">
          <ChevronRight size={20} stroke="#374151" />
        </TouchableOpacity>
      </View>

      <View className="flex-row mb-1">
        {DAY_NAMES.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <Text className="text-xs text-gray-400 font-medium">{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} className="flex-row">
          {row.map((day, ci) => {
            if (day === null) return <View key={ci} style={{ flex: 1, padding: 2 }} />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isSelected = selected.includes(dateStr)
            const isPast = disablePast && dateStr < todayStr
            return (
              <View key={ci} style={{ flex: 1, padding: 2 }}>
                <TouchableOpacity
                  onPress={() => toggleDay(day)}
                  disabled={isPast}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: isSelected ? '#c026d3' : 'transparent',
                    opacity: isPast ? 0.3 : 1,
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: isSelected ? '700' : '400',
                    color: isSelected ? '#fff' : '#374151',
                  }}>
                    {day}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      ))}

      {selected.length > 0 && (
        <Text className="text-xs text-brand-600 mt-2 font-medium">
          {selected.length} fecha{selected.length > 1 ? 's' : ''} seleccionada{selected.length > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  )
}
