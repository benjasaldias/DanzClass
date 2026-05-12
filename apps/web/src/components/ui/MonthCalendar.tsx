'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MonthCalendarProps {
  selected: string[]
  onChange: (dates: string[]) => void
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAY_HEADERS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

export default function MonthCalendar({ selected, onChange }: MonthCalendarProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const selectedSet = new Set(selected)
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function toISO(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function toggleDay(day: number) {
    const iso = toISO(day)
    const next = new Set(selectedSet)
    if (next.has(iso)) next.delete(iso)
    else next.add(iso)
    onChange(Array.from(next).sort())
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  // Build cell array: nulls for leading empty days, then 1..daysInMonth
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <span className="font-semibold text-sm text-gray-800">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 bg-white border-b border-gray-100">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 bg-white">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="py-2" />
          const iso = toISO(day)
          const isSelected = selectedSet.has(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                'py-2.5 text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-700 hover:bg-brand-50 hover:text-brand-700',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 min-h-[2rem] flex items-center">
        {selected.length === 0
          ? 'Toca los días para seleccionar fechas'
          : `${selected.length} fecha${selected.length !== 1 ? 's' : ''} seleccionada${selected.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}
