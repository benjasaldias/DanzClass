'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CityCombobox from '@/components/ui/CityCombobox'
import AddressAutocomplete from '@/components/ui/AddressAutocomplete'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { EventType } from '@danceclass/shared'

const noExp = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
}

interface EditEventFormProps {
  event: any
  userId: string
}

export default function EditEventForm({ event, userId }: EditEventFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description ?? '')
  const [eventType, setEventType] = useState<EventType>(event.event_type)
  const [eventDate, setEventDate] = useState(event.event_date)
  const [eventTime, setEventTime] = useState(event.event_time ?? '')
  const [city, setCity] = useState(event.city ?? '')
  const [address, setAddress] = useState(event.location_address ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    event.latitude != null && event.longitude != null ? { lat: event.latitude, lng: event.longitude } : null
  )
  const [hasSpots, setHasSpots] = useState(event.has_spots)
  const [maxSpots, setMaxSpots] = useState(event.max_spots?.toString() ?? '')
  const [hasEntry, setHasEntry] = useState(event.has_entry)
  const [entryPrice, setEntryPrice] = useState(event.entry_price?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('El título es obligatorio.')
    if (!eventDate) return setError('La fecha es obligatoria.')
    if (hasSpots && (!maxSpots || Number(maxSpots) < 1)) return setError('Ingresa un número válido de cupos.')
    if (hasEntry && (!entryPrice || Number(entryPrice) < 0)) return setError('Ingresa un precio de entrada válido.')

    // Re-geocode if the address changed and has no resolved coordinates.
    let resolvedCoords = coords
    const addr = address.trim()
    if (addr && !coords) {
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(addr)}&limit=1`)
        const json = await res.json()
        const best = json.results?.[0]
        if (best) resolvedCoords = { lat: best.lat, lng: best.lng }
        else return setError('No pudimos ubicar esa dirección en el mapa. Selecciona una sugerencia o revisa que sea válida en Chile.')
      } catch {
        return setError('No se pudo validar la dirección. Revisa tu conexión e intenta de nuevo.')
      }
    }

    setLoading(true)
    try {
      const { error: err } = await (supabase as any)
        .from('events')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          event_type: eventType,
          event_date: eventDate,
          event_time: eventTime || null,
          city: city.trim() || null,
          location_address: addr || null,
          latitude: resolvedCoords?.lat ?? null,
          longitude: resolvedCoords?.lng ?? null,
          has_spots: hasSpots,
          max_spots: hasSpots ? Number(maxSpots) : null,
          has_entry: hasEntry,
          entry_price: hasEntry ? Number(entryPrice) : null,
        })
        .eq('id', event.id)
        .eq('creator_id', userId)
      if (err) throw err
      router.push(`/event/${event.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar cambios.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    await (supabase as any)
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', event.id)
      .eq('creator_id', userId)
    router.push('/feed')
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Tipo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">Tipo de evento</label>
          <div className="flex gap-2">
            {(['batalla', 'masterclass', 'otro'] as EventType[]).map((t) => (
              <button key={t} type="button" onClick={() => setEventType(t)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors capitalize ${
                  eventType === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Título *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="input w-full" required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Descripción</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={800} rows={4} className="input w-full resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Fecha *</label>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="input w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Hora</label>
            <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="input w-full" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Ciudad</label>
          <CityCombobox value={city} onChange={setCity} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Dirección (opcional)</label>
          <AddressAutocomplete
            value={address}
            hasCoords={!!coords}
            onChange={(a, c) => { setAddress(a); setCoords(c) }}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-dark-text2">Elige una sugerencia para mostrar el evento en el mapa y en "Cerca".</p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text">Cupos limitados</p>
            <button type="button" onClick={() => setHasSpots(!hasSpots)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasSpots ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasSpots ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {hasSpots && (
            <input type="number" min={1} max={10000} step={1} value={maxSpots} onChange={(e) => setMaxSpots(e.target.value)}
              onKeyDown={noExp} onWheel={(e) => (e.target as HTMLInputElement).blur()} placeholder="ej. 100" className="input w-32" />
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text">Entrada pagada</p>
            <button type="button" onClick={() => setHasEntry(!hasEntry)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasEntry ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasEntry ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {hasEntry && (
            <input type="number" min={0} max={10000000} step={100} value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
              onKeyDown={noExp} onWheel={(e) => (e.target as HTMLInputElement).blur()} placeholder="ej. 5000" className="input w-40" />
          )}
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
          {loading ? 'Guardando...' : 'Guardar cambios'}
        </button>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-200 dark:border-red-800 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Zona de peligro</p>
          <p className="text-xs text-gray-500 dark:text-dark-text2">Cancelar el evento lo marca como cancelado. Esta acción no se puede deshacer.</p>
          <button type="button" onClick={() => setShowCancel(true)}
            className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 underline underline-offset-2">
            Cancelar evento
          </button>
        </div>
      </form>

      {showCancel && (
        <ConfirmDialog
          title="¿Cancelar el evento?"
          message="El evento quedará marcado como cancelado y los inscritos deberán ser notificados manualmente."
          confirmLabel="Sí, cancelar"
          destructive
          onConfirm={handleCancel}
          onCancel={() => setShowCancel(false)}
        />
      )}
    </>
  )
}
