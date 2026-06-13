'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, MapPin, Clock, Users, Search, Check, Loader2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import MonthCalendar from '@/components/ui/MonthCalendar'
import Avatar from '@/components/ui/Avatar'
import DateInput from '@/components/ui/DateInput'
import CityCombobox from '@/components/ui/CityCombobox'
import { createClient } from '@/lib/supabase/client'
import type { RehearsalDateMode } from '@danceclass/shared'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface CreateRehearsalModalProps {
  onClose: () => void
  onCreated?: () => void
}

const DATE_MODES: { id: RehearsalDateMode; label: string; desc: string }[] = [
  { id: 'single', label: 'Fecha específica', desc: 'Un día concreto' },
  { id: 'custom', label: 'Múltiples fechas', desc: 'Selecciona varios días' },
  { id: 'coordinate', label: 'Coordinar con integrantes', desc: 'Ver disponibilidad del grupo' },
]

export default function CreateRehearsalModal({ onClose, onCreated }: CreateRehearsalModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [location, setLocation] = useState('')
  const [dateMode, setDateMode] = useState<RehearsalDateMode>('single')
  const [rehearsalDate, setRehearsalDate] = useState('')
  const [rehearsalTime, setRehearsalTime] = useState('')
  const [customDates, setCustomDates] = useState<string[]>([])
  const [coordMonth, setCoordMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [durationMinutes, setDurationMinutes] = useState(60)

  // User search for invites
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<any[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      const q = searchQuery.trim().toLowerCase()
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10)
      const selectedIds = new Set(selectedUsers.map((u) => u.id))
      setSearchResults((data ?? []).filter((u: any) => !selectedIds.has(u.id)))
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedUsers])

  function toggleUser(user: any) {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id)
      if (exists) return prev.filter((u) => u.id !== user.id)
      return [...prev, user]
    })
    setSearchQuery('')
    setSearchResults([])
  }

  function removeUser(userId: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  // Month selector for coordinate mode
  const coordDate = new Date(coordMonth + '-01T00:00:00')
  const coordYear = coordDate.getFullYear()
  const coordMonthIdx = coordDate.getMonth()

  function prevMonth() {
    const d = new Date(coordYear, coordMonthIdx - 1, 1)
    setCoordMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    const d = new Date(coordYear, coordMonthIdx + 1, 1)
    setCoordMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('El título es requerido'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/rehearsal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || undefined,
        city: city || undefined,
        location: location || undefined,
        date_mode: dateMode,
        rehearsal_date: dateMode === 'single' ? rehearsalDate || undefined : undefined,
        rehearsal_time: dateMode === 'single' ? rehearsalTime || undefined : undefined,
        custom_dates: dateMode === 'custom' ? customDates : undefined,
        coordinate_month: dateMode === 'coordinate' ? coordMonth : undefined,
        duration_minutes: durationMinutes,
        invite_ids: selectedUsers.map((u) => u.id),
      }),
    })

    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(json.error ?? 'Error al crear ensayo'); return }
    onCreated?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-dark-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
          <div>
            <h2 className="font-bold text-lg text-gray-900 dark:text-dark-text">Crear ensayo</h2>
            <p className="text-xs text-gris-humo dark:text-dark-text2">Solo para invitados, sin precio</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text2" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Ensayo de hip-hop"
              className="input w-full"
              maxLength={100}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué van a trabajar?"
              className="input w-full resize-none"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Ciudad + Ubicación */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Ciudad</label>
              <CityCombobox value={city} onChange={setCity} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Lugar</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Estudio, sala..." className="input w-full text-sm" />
            </div>
          </div>

          {/* Duración */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">
              <Clock className="inline h-4 w-4 mr-1 text-[#7F77DD]" />
              Duración (minutos)
            </label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(15, Math.min(480, Number(e.target.value))))}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              className="input w-24"
              min={15}
              max={480}
              step={15}
            />
          </div>

          {/* Modo de fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
              <Calendar className="inline h-4 w-4 mr-1 text-[#7F77DD]" />
              Fechas
            </label>
            <div className="space-y-2">
              {DATE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setDateMode(mode.id)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-xl border p-3 text-left transition-colors',
                    dateMode === mode.id
                      ? 'border-[#7F77DD] bg-[#EEEDFE] dark:bg-dark-surface2 text-gray-900 dark:text-dark-text'
                      : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-surface2 text-gray-700 dark:text-dark-text2'
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{mode.label}</p>
                    <p className="text-xs text-gris-humo dark:text-dark-text2">{mode.desc}</p>
                  </div>
                  {dateMode === mode.id && <Check className="h-4 w-4 text-[#7F77DD] flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha única */}
          {dateMode === 'single' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Fecha</label>
                <DateInput
                  value={rehearsalDate}
                  onChange={setRehearsalDate}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Hora</label>
                <input
                  type="time"
                  value={rehearsalTime}
                  onChange={(e) => setRehearsalTime(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
            </div>
          )}

          {/* Múltiples fechas */}
          {dateMode === 'custom' && (
            <MonthCalendar selected={customDates} onChange={setCustomDates} disablePast />
          )}

          {/* Coordinar con integrantes */}
          {dateMode === 'coordinate' && (
            <div className="rounded-xl border border-[#7F77DD]/30 bg-[#EEEDFE]/40 dark:bg-dark-surface2/60 p-4">
              <p className="text-sm text-gray-700 dark:text-dark-text font-medium mb-1">Mes a coordinar</p>
              <p className="text-xs text-gris-humo dark:text-dark-text2 mb-3">
                Después de crear el ensayo, verás un calendario con la disponibilidad de todos los integrantes.
              </p>
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="rounded-lg border border-gray-200 dark:border-dark-border p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors">
                  <ChevronRight className="h-4 w-4 rotate-180 text-gray-600 dark:text-dark-text2" />
                </button>
                <span className="font-semibold text-sm text-gray-900 dark:text-dark-text flex-1 text-center">
                  {MONTHS_ES[coordMonthIdx]} {coordYear}
                </span>
                <button onClick={nextMonth} className="rounded-lg border border-gray-200 dark:border-dark-border p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors">
                  <ChevronRight className="h-4 w-4 text-gray-600 dark:text-dark-text2" />
                </button>
              </div>
            </div>
          )}

          {/* Invitar usuarios */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
              <Users className="inline h-4 w-4 mr-1 text-[#7F77DD]" />
              Invitar integrantes
            </label>

            {/* Chips de seleccionados */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 px-2.5 py-1 text-xs font-medium text-[#534AB7] dark:text-violet-300"
                  >
                    <Avatar src={u.avatar_url ?? null} name={u.full_name} size="xs" />
                    @{u.username}
                    <button onClick={() => removeUser(u.id)} className="hover:text-red-500 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o @usuario"
                className="input w-full pl-9 text-sm"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="mt-1 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden shadow-lg">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors text-left"
                  >
                    <Avatar src={u.avatar_url ?? null} name={u.full_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">{u.full_name}</p>
                      <p className="text-xs text-gris-humo dark:text-dark-text2">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="w-full rounded-xl bg-[#7F77DD] hover:bg-[#6B64C8] text-white font-semibold py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Creando ensayo...' : 'Crear ensayo'}
          </button>
        </div>
      </div>
    </div>
  )
}
