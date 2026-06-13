'use client'

import { Component, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Maximize2, Minimize2, ExternalLink, Loader2 } from 'lucide-react'
import { isValidChileCoord } from '@danceclass/shared'

class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { crashed: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { crashed: false }
  }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  render() {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}

// Leaflet must not render on the server (uses `window`).
const LocationMapInner = dynamic(() => import('./LocationMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-dark-surface2">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  ),
})

interface LocationMapProps {
  lat: number | null | undefined
  lng: number | null | undefined
  /** Street address shown above the map and used as a fallback when no coords. */
  address?: string | null
  /** Venue name (e.g. "Estudio Dance House"). */
  name?: string | null
}

/**
 * Self-contained location block for a class/event detail page:
 * textual address + interactive OSM map with a pin. Mobile-friendly,
 * expandable, with loading + graceful no-coordinates fallback.
 */
export default function LocationMap({ lat, lng, address, name }: LocationMapProps) {
  const [expanded, setExpanded] = useState(false)
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && isValidChileCoord(lat, lng)

  // No coordinates → show the textual address only (don't render a broken map).
  if (!hasCoords) {
    if (!name && !address) return null
    return (
      <div className="flex items-start gap-3 text-sm">
        <MapPin className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
        <div>
          {name && <p className="text-gray-700 dark:text-dark-text2">{name}</p>}
          {address && <p className="text-xs text-gray-500 dark:text-dark-text2">{address}</p>}
        </div>
      </div>
    )
  }

  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 text-sm min-w-0">
          <MapPin className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            {name && <p className="text-gray-700 dark:text-dark-text2 truncate">{name}</p>}
            {address && <p className="text-xs text-gray-500 dark:text-dark-text2 break-words">{address}</p>}
          </div>
        </div>
        <a
          href={gmaps}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300 hover:underline"
        >
          Cómo llegar <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border transition-[height] duration-300 ${
          expanded ? 'h-[60vh]' : 'h-48'
        }`}
      >
        <MapErrorBoundary
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-dark-surface2 text-xs text-gray-400">
              Mapa no disponible
            </div>
          }
        >
          <LocationMapInner lat={lat as number} lng={lng as number} className="h-full w-full" />
        </MapErrorBoundary>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Contraer mapa' : 'Expandir mapa'}
          className="absolute top-2 right-2 z-[1000] rounded-lg bg-white/90 dark:bg-dark-surface/90 p-2 shadow-md text-gray-700 dark:text-dark-text hover:bg-white dark:hover:bg-dark-surface"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
