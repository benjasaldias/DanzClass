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

// YYYY-MM-DD a partir de lo tecleado (DD/MM/AA o DD/MM/AAAA). '' si incompleto.
// Año de 2 dígitos → 20AA. El valor interno SIEMPRE queda en el formato de
// backend de siempre (YYYY-MM-DD).
function isoFromDigits(digits: string): string {
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  if (digits.length === 8) return `${digits.slice(4, 8)}-${m}-${d}`
  if (digits.length === 6) return `20${digits.slice(4, 6)}-${m}-${d}`
  return ''
}

export default function DateInput({ value, onChange, className }: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value))

  useEffect(() => {
    // Solo re-sincroniza cuando el `value` externo representa una fecha distinta
    // a la que el usuario está tecleando. Sin esto, al commitear un año de 2
    // dígitos (AA→20AA) el efecto reemplazaría "01/01/26" por "01/01/2026" y
    // rompería seguir escribiendo un año de 4 dígitos.
    const currentIso = isoFromDigits(display.replace(/\D/g, ''))
    if (currentIso === value) return
    setDisplay(isoToDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip non-digits, keep at most 8 digits (DDMMYYYY)
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)

    // Auto-insert slashes at positions 2 (DD/) and 4 (MM/)
    let formatted = digits
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    if (digits.length > 4) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5)

    setDisplay(formatted)
    onChange(isoFromDigits(digits))
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
