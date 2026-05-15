'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAY_HEADERS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

interface CustomDatesCalendarProps {
  dates: string[]
  onClose: () => void
}

export default function CustomDatesCalendar({ dates, onClose }: CustomDatesCalendarProps) {
  const dateSet = new Set(dates)

  // Start from the month of the earliest date, or current month
  const earliest = dates.length > 0 ? new Date(dates[0] + 'T00:00:00') : new Date()
  const [year, setYear] = useState(earliest.getFullYear())
  const [month, setMonth] = useState(earliest.getMonth())

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function toISO(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // Count how many class dates are in current month
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  const datesThisMonth = dates.filter(d => d.startsWith(prefix)).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Fechas de la clase</h2>
            <p className="text-xs text-gray-500 mt-0.5">{dates.length} clases programadas</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-1 py-2 mb-2">
          <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="text-center">
            <span className="text-sm font-semibold text-gray-900">
              {MONTH_NAMES[month]} {year}
            </span>
            {datesThisMonth > 0 && (
              <p className="text-xs text-brand-600">{datesThisMonth} clase{datesThisMonth !== 1 ? 's' : ''} este mes</p>
            )}
          </div>
          <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-[11px] font-medium text-gray-400 py-1">{h}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} />
            const iso = toISO(day)
            const isClassDate = dateSet.has(iso)
            return (
              <div key={idx} className="flex items-center justify-center py-0.5">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                  isClassDate
                    ? 'bg-brand-600 text-white font-bold'
                    : 'text-gray-700'
                )}>
                  {day}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <div className="h-3 w-3 rounded-full bg-brand-600 flex-shrink-0" />
          Fecha de clase programada
        </div>
      </div>
    </div>
  )
}
