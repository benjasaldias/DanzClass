'use client'

import { useState, useEffect } from 'react'

interface DateInputProps {
  value: string // YYYY-MM-DD internally
  onChange: (iso: string) => void
  className?: string
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 8) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d}/${m}/${y}`
}

export default function DateInput({ value, onChange, className }: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value))

  useEffect(() => {
    setDisplay(isoToDisplay(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip non-digits, keep at most 8 digits (DDMMYYYY)
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)

    // Auto-insert slashes at positions 2 (DD/) and 4 (MM/)
    let formatted = digits
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    if (digits.length > 4) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5)

    setDisplay(formatted)

    if (digits.length === 8) {
      const d = digits.slice(0, 2)
      const m = digits.slice(2, 4)
      const y = digits.slice(4, 8)
      onChange(`${y}-${m}-${d}`)
    } else {
      onChange('')
    }
  }

  return (
    <input
      type="text"
      value={display}
      onChange={handleChange}
      placeholder="DD/MM/AAAA"
      maxLength={10}
      inputMode="numeric"
      className={className}
    />
  )
}
