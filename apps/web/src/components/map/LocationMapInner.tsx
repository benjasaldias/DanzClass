'use client'

// Raw Leaflet map (OSM tiles, no API key). Loaded only on the client via a
// dynamic import in LocationMap.tsx (Leaflet touches `window`).
//
// NOTE: we use Leaflet's imperative API directly instead of `react-leaflet`.
// react-leaflet v5 strictly requires React 19, but this app runs on Next.js 14
// (React 18 runtime), and the mismatch makes react-leaflet's MapContainer crash.
// Raw Leaflet has zero React-version coupling, so it works reliably here.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Custom pin so we don't depend on Leaflet's default marker image assets
// (which break under bundlers). Uses the brand accent.
const pinIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:26px;height:26px;border-radius:50% 50% 50% 0;
    background:#c026d3;transform:rotate(-45deg);
    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

interface LocationMapInnerProps {
  lat: number
  lng: number
  zoom?: number
  className?: string
}

export default function LocationMapInner({ lat, lng, zoom = 15, className }: LocationMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  // Initialise the map once, then tear it down on unmount.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center: [lat, lng],
      zoom,
      scrollWheelZoom: false,
      attributionControl: true,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
    mapRef.current = map

    // Leaflet mis-measures when the container animates in (dynamic import,
    // expand/collapse). A ResizeObserver keeps the tiles filling the box.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Mount-only: lat/lng/zoom updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentre if the coordinates change (rare on a detail page, but cheap).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView([lat, lng], zoom)
    markerRef.current?.setLatLng([lat, lng])
  }, [lat, lng, zoom])

  return <div ref={containerRef} className={className} style={{ height: '100%', width: '100%' }} />
}
