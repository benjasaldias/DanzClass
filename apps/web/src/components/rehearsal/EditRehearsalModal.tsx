'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, MapPin, Clock, Users, Search, Check, Loader2, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import MonthCalendar from '@/components/ui/MonthCalendar'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import type { RehearsalDateMode } from '@danceclass/shared'

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DATE_MODES: { id: RehearsalDateMode; label: string; desc: string }[] = [
  { id: 'single', label: 'Fecha específica', desc: 'Un día concreto' },
  { id: 'custom', label: 'Múltiples fechas', desc: 'Selecciona varios días' },
  { id: 'coordinate', label: 'Coordinar con integrantes', desc: 'Ver disponibilidad del grupo' },
]

interface EditRehearsalModalProps {
  rehearsal: any
  onClose: () => void
  onSaved?: () => void
  onUpdated?: () => void
  onCancelled?: () => void
}

export default function EditRehearsalModal({ rehearsal, onClose, onSaved, onUpdated, onCancelled }: EditRehearsalModalProps) {
  const [title, setTitle] = useState(rehearsal.title ?? '')
  const [description, setDescription] = useState(rehearsal.description ?? '')
  const [city, setCity] = useState(rehearsal.city ?? '')
  const [location, setLocation] = useState(rehearsal.location ?? '')
  const [dateMode, setDateMode] = useState<RehearsalDateMode>(rehearsal.date_mode ?? 'single')
  const [rehearsalDate, setRehearsalDate] = useState(rehearsal.rehearsal_date ?? '')
  const [rehearsalTime, setRehearsalTime] = useState(rehearsal.rehearsal_time?.slice(0, 5) ?? '')
  const [customDates, setCustomDates] = useState<string[]>(rehearsal.custom_dates ?? [])
  const [coordMonth, setCoordMonth] = useState(() => {
    if (rehearsal.coordinate_month) return rehearsal.coordinate_month
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [durationMinutes, setDurationMinutes] = useState(rehearsal.duration_minutes ?? 60)

  // Invite more users section
  const [showInviteSection, setShowInviteSection] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<any[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const supabase = createClient()

  // Coord month navigation
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

  // User search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      const q = searchQuery.trim().toLowerCase()
      const existingIds = new Set([
        ...(rehearsal.invites ?? []).map((i: any) => i.user_id),
        ...selectedUsers.map((u) => u.id),
        rehearsal.creator_id,
      ])
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .eq('is_confirmed' as any, true)
        .limit(10)
      setSearchResults((data ?? []).filter((u: any) => !existingIds.has(u.id)))
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

  async function handleSendInvites() {
    if (selectedUsers.length === 0) return
    setInviting(true)
    try {
      await fetch('/api/rehearsal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rehearsal_id: rehearsal.id,
          user_ids: selectedUsers.map((u) => u.id),
        }),
      })
      setSelectedUsers([])
      setInviteSuccess(true)
      setTimeout(() => setInviteSuccess(false), 2000)
    } finally {
      setInviting(false)
    }
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('El título es requerido'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/rehearsal/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rehearsal_id: rehearsal.id,
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
      }),
    })

    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(json.error ?? 'Error al guardar'); return }
    onSaved?.()
    onUpdated?.()
    onClose()
  }

  async function handleCancel() {
    const res = await fetch('/api/rehearsal/update', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rehearsal_id: rehearsal.id }),
    })
    if (res.ok) {
      onCancelled?.()
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-dark-surface shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-3 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
            <div>
              <h2 className="font-bold text-lg text-gray-900 dark:text-dark-text">Editar ensayo</h2>
              <p className="text-xs text-gris-humo dark:text-dark-text2">{rehearsal.title}</p>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface2 transition-colors">
              <X className="h-5 w-5 text-gray-500 dark:text-dark-text2" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">Título *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full" maxLength={100} />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1.5">Descripción</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input w-full resize-none" rows={3} maxLength={500} />
            </div>

            {/* Ciudad + Ubicación */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Ciudad</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Santiago" className="input w-full pl-8 text-sm" />
                </div>
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
                min={15} max={480} step={15}
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

            {dateMode === 'single' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Fecha</label>
                  <input type="date" value={rehearsalDate} onChange={(e) => setRehearsalDate(e.target.value)} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dark-text mb-1">Hora</label>
                  <input type="time" value={rehearsalTime} onChange={(e) => setRehearsalTime(e.target.value)} className="input w-full text-sm" />
                </div>
              </div>
            )}

            {dateMode === 'custom' && (
              <MonthCalendar selected={customDates} onChange={setCustomDates} disablePast />
            )}

            {dateMode === 'coordinate' && (
              <div className="rounded-xl border border-[#7F77DD]/30 bg-[#EEEDFE]/40 dark:bg-dark-surface2/60 p-4">
                <p className="text-sm text-gray-700 dark:text-dark-text font-medium mb-3">Mes a coordinar</p>
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

            {/* Invitar más integrantes */}
            <div className="border border-gray-100 dark:border-dark-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowInviteSection((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-surface2 hover:bg-gray-100 dark:hover:bg-dark-surface text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#7F77DD]" />
                  <span className="text-sm font-medium text-gray-900 dark:text-dark-text">Invitar más integrantes</span>
                </div>
                <ChevronRight className={cn('h-4 w-4 text-gray-400 transition-transform', showInviteSection && 'rotate-90')} />
              </button>

              {showInviteSection && (
                <div className="px-4 pb-4 pt-3 space-y-3">
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedUsers.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#EEEDFE] dark:bg-dark-surface2 px-2.5 py-1 text-xs font-medium text-[#534AB7] dark:text-violet-300">
                          <Avatar url={u.avatar_url ?? null} name={u.full_name} size="xs" />
                          @{u.username}
                          <button onClick={() => setSelectedUsers((p) => p.filter((x) => x.id !== u.id))} className="hover:text-red-500 transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre o @usuario"
                      className="input w-full pl-9 text-sm"
                    />
                    {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden shadow-lg">
                      {searchResults.map((u) => (
                        <button key={u.id} onClick={() => toggleUser(u)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-surface2 transition-colors text-left">
                          <Avatar url={u.avatar_url ?? null} name={u.full_name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">{u.full_name}</p>
                            <p className="text-xs text-gris-humo dark:text-dark-text2">@{u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedUsers.length > 0 && (
                    <button
                      onClick={handleSendInvites}
                      disabled={inviting}
                      className={cn(
                        'w-full rounded-xl py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2',
                        inviteSuccess
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#7F77DD] hover:bg-[#6B64C8] text-white disabled:opacity-50'
                      )}
                    >
                      {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {inviteSuccess ? '¡Invitaciones enviadas!' : `Invitar (${selectedUsers.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Guardar */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="w-full rounded-xl bg-[#7F77DD] hover:bg-[#6B64C8] text-white font-semibold py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Guardando...' : 'Guardar cambios'}
            </button>

            {/* Zona peligrosa */}
            <div className="border border-red-100 dark:border-red-900/30 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Zona peligrosa
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                Al cancelar el ensayo, se notificará a todos los integrantes y ya no aparecerá en sus agendas.
              </p>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                Cancelar ensayo
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCancelConfirm && (
        <ConfirmDialog
          title="¿Cancelar ensayo?"
          description={`"${rehearsal.title}" será cancelado para todos los integrantes.`}
          confirmLabel="Sí, cancelar"
          destructive
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  )
}
