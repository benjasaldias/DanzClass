import { useState } from 'react'
import { View, Text, TouchableOpacity, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { MapPin, Maximize2, Minimize2, ExternalLink } from 'lucide-react-native'
import { isValidChileCoord } from '@danceclass/shared'

interface Props {
  lat?: number | null
  lng?: number | null
  address?: string | null
  name?: string | null
}

// Self-contained Leaflet map (OSM tiles, no API key) rendered inside a WebView.
// Same free stack as the web map, no native map SDK / Google key required.
function buildHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background:#e5e7eb; }
    .pin { width:24px;height:24px;border-radius:50% 50% 50% 0;background:#c026d3;
           transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var icon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [24,24], iconAnchor: [12,24] });
    L.marker([${lat}, ${lng}], { icon: icon }).addTo(map);
    setTimeout(function(){ map.invalidateSize(); }, 200);
  </script>
</body>
</html>`
}

export default function LeafletMap({ lat, lng, address, name }: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && isValidChileCoord(lat, lng)

  // No coordinates → show the textual address only.
  if (!hasCoords) {
    if (!name && !address) return null
    return (
      <View className="flex-row items-start gap-2">
        <MapPin size={16} color="#c026d3" />
        <View className="flex-1">
          {name ? <Text className="text-sm text-gray-700 dark:text-dark-text2">{name}</Text> : null}
          {address ? <Text className="text-xs text-gray-500 dark:text-dark-text2">{address}</Text> : null}
        </View>
      </View>
    )
  }

  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <View>
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-row items-start gap-2 flex-1 pr-2">
          <MapPin size={16} color="#c026d3" />
          <View className="flex-1">
            {name ? <Text className="text-sm text-gray-700 dark:text-dark-text2">{name}</Text> : null}
            {address ? <Text className="text-xs text-gray-500 dark:text-dark-text2">{address}</Text> : null}
          </View>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(gmaps)} className="flex-row items-center gap-1">
          <Text className="text-xs font-medium text-brand-600 dark:text-brand-300">Cómo llegar</Text>
          <ExternalLink size={12} color="#c026d3" />
        </TouchableOpacity>
      </View>

      <View
        className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border"
        style={{ height: expanded ? 360 : 180 }}
      >
        <WebView
          originWhitelist={['*']}
          source={{ html: buildHtml(lat as number, lng as number) }}
          style={{ flex: 1, backgroundColor: '#e5e7eb' }}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
        />
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          className="absolute top-2 right-2 bg-white/90 dark:bg-dark-surface/90 rounded-lg p-2 shadow"
        >
          {expanded ? <Minimize2 size={16} color="#374151" /> : <Maximize2 size={16} color="#374151" />}
        </TouchableOpacity>
      </View>
    </View>
  )
}
