'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeocodeResult } from '@danceclass/shared'

interface AddressAutocompleteProps {
  value: string
  /** Fires on every change. coords is non-null only when a geocoded suggestion is chosen. */
  onChange: (address: string, coords: { lat: number; lng: number } | null) => void
  /** Whether the current value already has resolved coordinates (controlled by parent). */
  hasCoords?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Chile-only address field with autocomplete backed by /api/geocode/search.
 * Picking a suggestion returns its coordinates to the parent. Free typing
 * clears the coordinates (the parent re-geocodes on submit if needed).
 */
export default function AddressAutocomplete({
  value,
  onChange,
  hasCoords = false,
  placeholder = 'ej: Av. Providencia 1234, Santiago',
  className,
  disabled,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [justSelected, setJustSelected] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const search = useCallback((q: string) => {
    abortRef.current?.abort()
    if (q.trim().length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
      .then((response) => response.json())
      .then((data) => {
        setResults(data.results ?? [])
        setOpen(true)
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setResults([])
      })
      .finally(() => setLoading(false))
  }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setJustSelected(false)
    onChange(text, null) // typing invalidates any previously resolved coords
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 350)
  }

  function handleSelect(item: GeocodeResult) {
    onChange(item.address, { lat: item.lat, lng: item.lng })
    setResults([])
    setOpen(false)
    setJustSelected(true)
  }

  function handleClear() {
    onChange('', null)
    setResults([])
    setJustSelected(false)
  }

  const showCheck = (hasCoords || justSelected) && value.trim().length > 0

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="input pl-9 pr-9 w-full"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
          {loading ? (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          ) : showCheck ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : value.trim().length > 0 ? (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600" aria-label="Limpiar">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </span>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {results.map((item, i) => (
            <li key={`${item.lat},${item.lng},${i}`}>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-dark-text hover:bg-brand-50 dark:hover:bg-dark-surface2 hover:text-brand-700 dark:hover:text-brand-300 transition-colors flex items-start gap-2"
              >
                <MapPin className="h-4 w-4 mt-0.5 text-brand-500 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCheck && (
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Ubicación encontrada en el mapa ✓</p>
      )}
    </div>
  )
}
