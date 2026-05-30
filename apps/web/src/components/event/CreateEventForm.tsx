'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CityCombobox from '@/components/ui/CityCombobox'
import type { EventType } from '@danceclass/shared'

const noExp = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
}

interface CreateEventFormProps {
  userId: string
  userCity: string | null
}

export default function CreateEventForm({ userId, userCity }: CreateEventFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<EventType>('batalla')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [city, setCity] = useState(userCity ?? '')
  const [hasSpots, setHasSpots] = useState(false)
  const [maxSpots, setMaxSpots] = useState('')
  const [hasEntry, setHasEntry] = useState(false)
  const [entryPrice, setEntryPrice] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('El título es obligatorio.')
    if (!eventDate) return setError('La fecha del evento es obligatoria.')
    if (hasSpots && (!maxSpots || Number(maxSpots) < 1)) return setError('Ingresa un número válido de cupos.')
    if (hasEntry && (!entryPrice || Number(entryPrice) < 0)) return setError('Ingresa un precio de entrada válido.')

    setLoading(true)
    try {
      let coverUrl: string | null = null

      if (coverFile) {
        const ext = coverFile.name.split('.').pop()
        const path = `${userId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('event-media')
          .upload(path, coverFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('event-media').getPublicUrl(path)
        coverUrl = urlData.publicUrl
      }

      const payload: any = {
        creator_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        event_date: eventDate,
        event_time: eventTime || null,
        city: city.trim() || null,
        cover_url: coverUrl,
        has_spots: hasSpots,
        max_spots: hasSpots ? Number(maxSpots) : null,
        has_entry: hasEntry,
        entry_price: hasEntry ? Number(entryPrice) : null,
      }

      const { data: newEvent, error: insertError } = await (supabase as any)
        .from('events')
        .insert(payload)
        .select('id')
        .single()

      if (insertError) throw insertError

      router.push(`/event/${newEvent.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Error al crear el evento.')
    } finally {
      setLoading(false)
    }
  }

  return (
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
            <button
              key={t}
              type="button"
              onClick={() => setEventType(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors capitalize ${
                eventType === t
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text hover:border-brand-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Título */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
          Título <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ej. Batalla de House 2v2"
          maxLength={100}
          className="input w-full"
          required
        />
      </div>

      {/* Descripción */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cuéntales de qué va el evento, reglas, artistas invitados..."
          maxLength={800}
          rows={4}
          className="input w-full resize-none"
        />
        <p className="text-xs text-gray-400 dark:text-dark-text2 mt-1 text-right">{description.length}/800</p>
      </div>

      {/* Fecha y hora */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
            Fecha <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Hora (opcional)</label>
          <input
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            className="input w-full"
          />
        </div>
      </div>

      {/* Ciudad */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">Ciudad</label>
        <CityCombobox value={city} onChange={setCity} />
      </div>

      {/* Cover */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">Imagen del evento</label>
        {coverPreview ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface2">
            <Image src={coverPreview} alt="cover" fill className="object-cover" />
            <button
              type="button"
              onClick={() => { setCoverFile(null); setCoverPreview(null) }}
              className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 w-full aspect-video rounded-xl border-2 border-dashed border-gray-200 dark:border-dark-border cursor-pointer hover:border-brand-400 transition-colors bg-gray-50 dark:bg-dark-surface">
            <Upload className="h-6 w-6 text-gray-400 dark:text-dark-text2" />
            <span className="text-sm text-gray-500 dark:text-dark-text2">Sube una imagen (opcional)</span>
            <input type="file" accept="image/*" onChange={handleCoverChange} className="sr-only" />
          </label>
        )}
      </div>

      {/* Cupos */}
      <div className="rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text">Cupos limitados</p>
            <p className="text-xs text-gray-500 dark:text-dark-text2">Controla la cantidad de asistentes</p>
          </div>
          <button
            type="button"
            onClick={() => setHasSpots(!hasSpots)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasSpots ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasSpots ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {hasSpots && (
          <div>
            <label className="block text-xs text-gray-600 dark:text-dark-text2 mb-1">Número de cupos</label>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={maxSpots}
              onChange={(e) => setMaxSpots(e.target.value)}
              onKeyDown={noExp}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="ej. 100"
              className="input w-32"
            />
          </div>
        )}
      </div>

      {/* Entrada */}
      <div className="rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text">Entrada pagada</p>
            <p className="text-xs text-gray-500 dark:text-dark-text2">Los asistentes deben pagar para confirmar</p>
          </div>
          <button
            type="button"
            onClick={() => setHasEntry(!hasEntry)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasEntry ? 'bg-brand-600' : 'bg-gray-200 dark:bg-dark-surface2'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasEntry ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {hasEntry && (
          <div>
            <label className="block text-xs text-gray-600 dark:text-dark-text2 mb-1">Precio de entrada (CLP)</label>
            <input
              type="number"
              min={0}
              max={10000000}
              step={100}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              onKeyDown={noExp}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="ej. 5000"
              className="input w-40"
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {loading ? 'Creando evento...' : 'Crear evento'}
      </button>
    </form>
  )
}
