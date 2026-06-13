import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import type { GeocodeResult } from '@danceclass/shared'

const WEB_URL = 'https://dc-project-web.vercel.app'
const CACHE_KEY = 'danzclass_user_location_v1'
// Reuse a fix for 10 minutes to avoid re-prompting / draining GPS.
const TTL_MS = 10 * 60 * 1000

export type LocationResult =
  | { status: 'granted'; location: { lat: number; lng: number } }
  | { status: 'denied' }
  | { status: 'unavailable' }

async function readCache(): Promise<{ lat: number; lng: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.lat === 'number' && typeof v?.lng === 'number' && Date.now() - v.at < TTL_MS) {
      return { lat: v.lat, lng: v.lng }
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Get the device location with graceful degradation:
 * - serves a cached fix when fresh (avoids re-prompting),
 * - returns `denied` when the user refuses the permission,
 * - returns `unavailable` when GPS/location fails for any other reason.
 */
export async function getUserLocation(): Promise<LocationResult> {
  const cached = await readCache()
  if (cached) return { status: 'granted', location: cached }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return { status: 'denied' }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    const location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...location, at: Date.now() }))
    } catch {
      /* ignore */
    }
    return { status: 'granted', location }
  } catch {
    return { status: 'unavailable' }
  }
}

/**
 * Chile-only address autocomplete via the web geocode proxy (Bearer auth).
 * Returns [] on any failure so callers can degrade silently.
 */
export async function geocodeSearch(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 3) return []
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return []
  try {
    const res = await fetch(`${WEB_URL}/api/geocode/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.results ?? []
  } catch {
    return []
  }
}
