'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHILEAN_CITIES } from '@danceclass/shared'

interface CityComboboxProps {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}

export default function CityCombobox({ value, onChange, placeholder = 'Ciudad', className }: CityComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setInputVal(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = CHILEAN_CITIES.filter((c) =>
    c.toLowerCase().includes(inputVal.toLowerCase())
  )

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setInputVal(e.target.value)
    onChange(e.target.value)
    setOpen(true)
  }

  function handleSelect(city: string) {
    setInputVal(city)
    onChange(city)
    setOpen(false)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={inputVal}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="input pl-9 pr-8 w-full"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((city) => (
              <li key={city}>
                <button
                  type="button"
                  onClick={() => handleSelect(city)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors',
                    inputVal === city && 'bg-brand-50 text-brand-700 font-medium'
                  )}
                >
                  {city}
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-2.5 text-sm text-gray-400">Usar "{inputVal}" como ciudad</li>
          )}
          {inputVal && !CHILEAN_CITIES.includes(inputVal as any) && filtered.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => handleSelect(inputVal)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 border-t border-gray-100"
              >
                Usar "{inputVal}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
