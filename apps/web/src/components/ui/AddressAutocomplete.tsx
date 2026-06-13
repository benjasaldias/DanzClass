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
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  // Keep a ref to the latest onChange so callbacks never capture a stale closure.
  // This is the key fix: calling onChangeRef.current(...) instead of onChange(...)
  // directly avoids any Terser minification variable-shadowing conflicts.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(evt: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evt.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = useCallback((query: string) => {
    abortRef.current?.abort()
    if (query.trim().length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((payload) => {
        if (!mountedRef.current) return
        const items: GeocodeResult[] = Array.isArray(payload.results) ? payload.results : []
        setResults(items)
        if (items.length > 0) setOpen(true)
      })
      .catch((fetchErr) => {
        if (fetchErr?.name !== 'AbortError' && mountedRef.current) setResults([])
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [])

  const handleInput = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
    const text = evt.target.value
    setJustSelected(false)
    onChangeRef.current(text, null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 350)
  }, [search])

  const handleSelect = useCallback((geocodeResult: GeocodeResult) => {
    // Cancel any pending debounce and in-flight request so the dropdown
    // does not re-open after the user has already chosen a suggestion.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    onChangeRef.current(geocodeResult.address, { lat: geocodeResult.lat, lng: geocodeResult.lng })
    setResults([])
    setOpen(false)
    setJustSelected(true)
  }, [])

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    onChangeRef.current('', null)
    setResults([])
    setOpen(false)
    setJustSelected(false)
  }, [])

  const showCheck = (hasCoords || justSelected) && value.trim().length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
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
          {results.map((suggestion, idx) => (
            <li key={`${suggestion.lat},${suggestion.lng},${idx}`}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-dark-text hover:bg-brand-50 dark:hover:bg-dark-surface2 hover:text-brand-700 dark:hover:text-brand-300 transition-colors flex items-start gap-2"
              >
                <MapPin className="h-4 w-4 mt-0.5 text-brand-500 flex-shrink-0" />
                <span>{suggestion.label}</span>
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
