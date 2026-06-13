'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'

export interface UserLocation {
  lat: number
  lng: number
  /** epoch ms when captured */
  at: number
}

const CACHE_KEY = 'danzclass_user_location_v1'
// Reuse a fix for 10 minutes to avoid re-prompting / spamming GPS.
const TTL_MS = 10 * 60 * 1000

function readCache(): UserLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.lat === 'number' && typeof v?.lng === 'number' && Date.now() - v.at < TTL_MS) {
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Browser geolocation with graceful degradation and caching.
 * - `request()` asks for permission (or serves a cached fix).
 * - Handles denial (`denied`) and missing/failed GPS (`unavailable`).
 * - Caches the last fix in localStorage for TTL_MS so we don't re-prompt.
 */
export function useUserLocation({ auto = false }: { auto?: boolean } = {}) {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')
  const requestedRef = useRef(false)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setLocation(cached)
      setStatus('granted')
    }
  }, [])

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    const cached = readCache()
    if (cached) {
      setLocation(cached)
      setStatus('granted')
      return
    }
    setStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }
        setLocation(loc)
        setStatus('granted')
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(loc))
        } catch {
          /* ignore quota / private mode */
        }
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: false, maximumAge: TTL_MS, timeout: 10000 }
    )
  }, [])

  useEffect(() => {
    if (auto && !requestedRef.current) {
      requestedRef.current = true
      request()
    }
  }, [auto, request])

  return { location, status, request }
}
