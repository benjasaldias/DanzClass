'use client'

// Raw Leaflet map (OSM tiles, no API key). Loaded only on the client via a
// dynamic import in LocationMap.tsx (Leaflet touches `window`).
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
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
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className}
      style={{ height: '100%', width: '100%' }}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <Marker position={[lat, lng]} icon={pinIcon} />
    </MapContainer>
  )
}
