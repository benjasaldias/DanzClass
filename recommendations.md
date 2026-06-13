# Location-Aware Dance Classes — Architecture & Decisions

> Feature: discover nearby classes/events using the device location, geocode every
> class/event address into coordinates, sort by distance and show an interactive map.
> Country scope: **Chile only** (for now). Goal: reliable, good UX, low/zero recurring
> cost, free/OSS first, scalable.

---

## 1. Chosen stack (summary)

| Concern | Decision | Why |
|---|---|---|
| **Geocoding + autocomplete** | **Nominatim (OpenStreetMap)** behind our own server proxy (`/api/geocode/search`) | Free, OSS, no API key. `countrycodes=cl` gives native Chile-only filtering. Proxying lets us set a compliant `User-Agent`, cache, and rate-limit — required by the Nominatim usage policy. |
| **Map rendering** | **Leaflet + OSM raster tiles** | Free, OSS, no key, no recurring cost. Web via `react-leaflet`; mobile via Leaflet inside a `react-native-webview` (no native map SDK / Google key needed). |
| **Coordinate storage** | `latitude` / `longitude` `double precision` columns on `classes` and `events`, plus a **PostGIS `geography(Point,4326)` generated column + GiST index** | Plain lat/lng always works and is trivial to read on the client; the PostGIS column powers fast, correct distance queries at scale. PostGIS is already enabled (migration 001). |
| **Distance — sorting** | **PostGIS `ST_DWithin` + `ST_Distance`** via RPC `nearby_classes()` / `nearby_events()` | Geospatial query is the correct, index-accelerated, scalable way to "nearest first within radius". Returns `distance_m` to the client. |
| **Distance — display** | **Haversine** helper in `packages/shared` (`haversineMeters`) | When coords are already on the client (feed cards), no extra round-trip is needed to render a badge. |
| **User location** | Web: `navigator.geolocation`; Mobile: `expo-location`. Cached with a TTL. | Standard, free, no dependency cost on web. `expo-location` is the Expo-blessed module. |
| **Data migration** | **Admin-triggered idempotent backfill** (`/api/admin/geocode-backfill` + `supabase/scripts/geocode-backfill.ts`) | Safest: controlled, rate-limited (1 req/s to respect Nominatim), re-runnable, never blocks user requests, never deletes data. |

---

## 2. Why these and not the alternatives

- **Nominatim vs Google/Mapbox/HERE Geocoding:** Google & Mapbox are excellent but bill per
  request and require key management + billing alerts. The brief prioritises *free/OSS* and
  *low operating cost*. Nominatim with `countrycodes=cl` is accurate enough for Chilean street
  addresses and costs $0. **Scaling path:** self-host Nominatim (one VM with the Chile OSM
  extract) to remove the public-instance rate limit — documented below.
- **Nominatim vs Photon (komoot) for autocomplete:** Photon is nicer for type-ahead, but it has
  weaker strict country filtering and is another moving part. Using a single provider
  (Nominatim, proxied + debounced + cached) keeps the system simple and Chile-only filtering is
  first-class (`countrycodes=cl`). Photon is noted as a drop-in upgrade if autocomplete latency
  becomes a problem.
- **Leaflet vs Mapbox GL / Google Maps:** Mapbox/Google tiles need a key and bill on map loads.
  Leaflet + OSM tiles are free and key-less. For mobile we deliberately avoid `react-native-maps`
  (needs a Google Maps API key + native build config) and `expo-maps` (native, key-driven); a
  WebView-hosted Leaflet map reuses the exact same free tiles as web and needs no key.
- **PostGIS vs pure-Haversine-in-app:** We use *both*. PostGIS for the authoritative
  nearest-first query (indexable, scales to large tables, computes on the DB). Haversine in shared
  for cheap client-side display when the rows (with coords) are already loaded. Pure app-side
  sorting would force fetching every class into memory — fine now, not scalable.

---

## 3. Data model changes

Migration `044_class_event_coordinates.sql`:

- `ALTER TABLE classes  ADD COLUMN latitude double precision, ADD COLUMN longitude double precision;`
- `ALTER TABLE events   ADD COLUMN latitude double precision, ADD COLUMN longitude double precision;`
- Generated geography column (guarded — only if PostGIS present):
  `geog geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN longitude IS NULL OR latitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(longitude, latitude),4326)::geography END) STORED`
- `CREATE INDEX ... USING GIST (geog)` on both tables.
- RPC `nearby_classes(p_lat, p_lng, p_radius_m, p_limit)` and `nearby_events(...)` — `STABLE`,
  `SECURITY INVOKER` (RLS of the caller still applies; classes/events are publicly readable),
  filtered to `status='active'`, ordered by `ST_Distance`, returning `distance_m`.

`Class` type in `packages/shared` gains `latitude: number | null`, `longitude: number | null`.
Original textual address fields are **kept** (`location_name`, `location_address`, `city`) — we add
coordinates, we don't replace the human-readable address.

**Rollback:** `ALTER TABLE classes DROP COLUMN IF EXISTS geog, DROP COLUMN latitude, DROP COLUMN
longitude;` (idem events) + `DROP FUNCTION nearby_classes, nearby_events;`.

---

## 4. Geocoding flow (creation & validation)

1. User types in the **AddressAutocomplete** field (web) / **AddressPicker** (mobile).
2. Debounced (350 ms) calls hit `/api/geocode/search?q=...` → server proxies Nominatim
   (`countrycodes=cl`, `addressdetails=1`, `limit=5`, compliant `User-Agent`), returns
   `[{ label, address, lat, lng }]`.
3. User selects a suggestion → the form stores `location_address`, `latitude`, `longitude`.
4. On submit, if an address was typed but no suggestion selected, the form geocodes the typed
   text (top result). **If geocoding fails → block submit with a clear error**; an address with no
   coordinates is never saved. Leaving the address empty is still allowed (location optional), but
   such a class simply won't appear in distance-sorted results until backfilled/edited.

---

## 5. Nearby feed

1. Acquire location via `useUserLocation` (web) / `getUserLocation` (mobile): request permission,
   handle denial/unavailable gracefully, **cache** the last fix (TTL ~10 min) to avoid spamming GPS.
2. Call `nearby_classes(lat,lng,radius,limit)` (default radius 50 km) → already sorted nearest-first
   with `distance_m`.
3. Render a compact distance badge via `formatDistance(m)`:
   `< 1000 m` → `"120 m"` / `"450 m"`; `>= 1000 m` → one decimal km `"1.2 km"` / `"8.7 km"`.
4. If permission denied/unavailable → fall back to the existing **city-based** "Cerca" behaviour and
   show a non-blocking hint to enable location.

---

## 6. Class/Event detail map

`ClassMap` (web, `react-leaflet`, dynamically imported to avoid SSR `window` errors) and
`LeafletMap` (mobile, WebView). Shows a marker at the class coordinates, an "open in maps" link,
**loading skeleton**, **error fallback** (if no coords: show address text only), and an
**expand/collapse** control. If a class has no coordinates, the map is hidden and only the textual
address is shown.

---

## 7. Cost

All chosen components are **$0 recurring**: OSM tiles, public Nominatim, Leaflet, browser
geolocation, `expo-location`. The only costs are existing (Supabase, Vercel, Upstash). PostGIS adds
no cost (already enabled).

---

## 8. Limitations & scaling concerns

- **Public Nominatim rate limit (1 req/s, no bulk).** Mitigated by: server proxy, request
  debouncing, response caching, and a 1 req/s throttle in the backfill script. **At scale, self-host
  Nominatim** (Chile OSM extract on a small VM, ~a few GB) — removes the limit and the ToS bulk
  restriction. This is the primary scaling action.
- **OSM tile usage policy.** The public `tile.openstreetmap.org` is fine for an alpha but also
  discourages heavy use. **Scaling path:** a tile provider with a free tier (e.g. MapTiler /
  Stadia / Carto) or self-hosted tiles; swap one URL in `LeafletMap`/`ClassMap`.
- **Geocoding accuracy.** OSM coverage of Chilean addresses is good in cities, thinner in rural
  zones. Users can still save a class without coordinates (it just won't be distance-ranked).
- **No reverse-geocoding of the user's GPS** is implemented yet (we sort by raw distance, which is
  what matters); could be added to label the user's neighbourhood.
- **Mobile map via WebView** has a slightly heavier first paint than a native map; acceptable for a
  detail screen and avoids API keys + native rebuilds.

---

## 9. Alternatives considered (rejected)

- Google Places Autocomplete + Maps JS — best UX, but per-request billing & key management.
- Mapbox GL JS + Mapbox Geocoding — great, but billed and key-bound.
- `react-native-maps` / `expo-maps` for mobile — native, needs Google key + native build.
- Pure in-app Haversine sorting only — simple but not scalable (loads all rows client-side).
- A custom trie / custom geo index — explicitly out of scope and reinvents PostGIS.

---

## 10. Status / iterations — ✅ COMPLETE

- [x] Shared geo lib (`haversineMeters`, `formatDistance`, `isValidChileCoord`, `hasCoords`, `CHILE_CENTER`, types) + `Class` coords + DB types + unit tests (`tests/unit/geo.test.ts`, all green)
- [x] DB migration `044_class_event_coordinates.sql` (lat/lng on classes+events, `location_address` on events, PostGIS generated `geog` + GiST indexes, `nearby_classes` / `nearby_events` RPCs)
- [x] Web geocode proxy `/api/geocode/search` (Nominatim, `countrycodes=cl`, cached, rate-limited `geocode` limiter) + admin backfill `/api/admin/geocode-backfill` + script `supabase/scripts/geocode-backfill.mjs`
- [x] Web `AddressAutocomplete` integrated in Create/Edit Class + Create/Edit Event forms, with geocode-on-submit validation (blocks save if address can't be located)
- [x] Web `useUserLocation` hook + nearby distance sort (RPC) in `useFeed`/`FeedClient` + distance badge in `ClassCard` + location status banner
- [x] Web `LocationMap` (react-leaflet, dynamic import) in `ClassDetailClient` + `EventDetailClient` — expandable, loading + no-coords fallback
- [x] Mobile `expo-location` + `react-native-webview` deps + app.json permissions; `lib/location.ts`, `AddressPicker`, `LeafletMap` (WebView); integrated in mobile class create/edit, event create, class/event detail, and the nearby feed (RPC distance sort + badge + banner)
- [x] Typecheck: web clean (only the 2 expected `leaflet`/`react-leaflet` module-not-found, resolved on Vercel install); shared clean; mobile only the 2 expected missing-module errors (resolved on EAS build), no new baseline regressions
- [x] Docs (CLAUDE.md, resumen.md, this file)

### Pending user actions (deploy-time)

1. **Vercel:** `npm install` runs automatically on deploy and pulls `leaflet`, `react-leaflet`, `@types/leaflet`. No action needed beyond a redeploy.
2. **Mobile:** run `npm install` in `apps/mobile` (or let EAS do it) so `expo-location` + `react-native-webview` are installed, then `eas build` (these are native modules → needs a new dev/preview build, not just OTA).
3. **Supabase:** apply migration `044_class_event_coordinates.sql` in production. Confirm PostGIS is enabled (it is, from migration 001).
4. **Optional env:** set `GEOCODE_CONTACT_EMAIL` (defaults to `contacto@danzclass.com`) and, at scale, `NOMINATIM_BASE_URL` to a self-hosted instance.
5. **Backfill existing rows:** after migration, run the backfill (superadmin): `POST /api/admin/geocode-backfill` repeatedly until `hasMore=false`, or use `supabase/scripts/geocode-backfill.mjs`. Idempotent and rate-limited (1 req/s).
6. **Upstash:** the `geocode` rate limiter is active only when Upstash env vars are set (degrades gracefully otherwise — already the project's pattern).
