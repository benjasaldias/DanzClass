-- 045_class_event_coordinates.sql
-- Location-aware classes/events: store geocoded coordinates and enable
-- index-accelerated "nearby" distance queries via PostGIS.
--
-- PostGIS is enabled in 001_initial_schema.sql. This migration is defensive:
-- the plain latitude/longitude columns always work; the geography column +
-- GiST index + RPCs are only created when PostGIS is actually present.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS nearby_classes(double precision,double precision,double precision,integer);
--   DROP FUNCTION IF EXISTS nearby_events(double precision,double precision,double precision,integer);
--   DROP INDEX IF EXISTS classes_geog_gist;
--   DROP INDEX IF EXISTS events_geog_gist;
--   ALTER TABLE classes DROP COLUMN IF EXISTS geog, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
--   ALTER TABLE events  DROP COLUMN IF EXISTS geog, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude, DROP COLUMN IF EXISTS location_address;

-- ── 1. Plain coordinate columns (always available) ──────────────────────────
ALTER TABLE classes ADD COLUMN IF NOT EXISTS latitude  double precision;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE events  ADD COLUMN IF NOT EXISTS latitude         double precision;
ALTER TABLE events  ADD COLUMN IF NOT EXISTS longitude        double precision;
-- Events previously only stored `city`. Add an optional street address so they
-- can be geocoded and placed on the map like classes.
ALTER TABLE events  ADD COLUMN IF NOT EXISTS location_address text;

-- ── 2. PostGIS geography (generated) + spatial index + RPCs ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN

    -- Generated geography point derived from lat/lng (NULL until geocoded).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'classes' AND column_name = 'geog'
    ) THEN
      ALTER TABLE classes ADD COLUMN geog geography(Point, 4326)
        GENERATED ALWAYS AS (
          CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL
               ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END
        ) STORED;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'geog'
    ) THEN
      ALTER TABLE events ADD COLUMN geog geography(Point, 4326)
        GENERATED ALWAYS AS (
          CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL
               ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END
        ) STORED;
    END IF;

    CREATE INDEX IF NOT EXISTS classes_geog_gist ON classes USING GIST (geog);
    CREATE INDEX IF NOT EXISTS events_geog_gist  ON events  USING GIST (geog);

    -- nearby_classes: active classes within p_radius_m of (p_lat,p_lng),
    -- nearest first, capped at p_limit. Returns id + distance in meters.
    -- SECURITY INVOKER (default): the caller's RLS still applies (classes are
    -- publicly readable, so anon/auth both work).
    CREATE OR REPLACE FUNCTION nearby_classes(
      p_lat      double precision,
      p_lng      double precision,
      p_radius_m double precision DEFAULT 50000,
      p_limit    integer          DEFAULT 60
    )
    RETURNS TABLE (id uuid, distance_m double precision)
    LANGUAGE sql
    STABLE
    AS $fn$
      SELECT c.id,
             ST_Distance(c.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
      FROM classes c
      WHERE c.status = 'active'
        AND c.geog IS NOT NULL
        AND ST_DWithin(c.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
      ORDER BY distance_m ASC
      LIMIT GREATEST(p_limit, 1);
    $fn$;

    CREATE OR REPLACE FUNCTION nearby_events(
      p_lat      double precision,
      p_lng      double precision,
      p_radius_m double precision DEFAULT 50000,
      p_limit    integer          DEFAULT 60
    )
    RETURNS TABLE (id uuid, distance_m double precision)
    LANGUAGE sql
    STABLE
    AS $fn$
      SELECT e.id,
             ST_Distance(e.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
      FROM events e
      WHERE e.status = 'active'
        AND e.geog IS NOT NULL
        AND ST_DWithin(e.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
      ORDER BY distance_m ASC
      LIMIT GREATEST(p_limit, 1);
    $fn$;

    GRANT EXECUTE ON FUNCTION nearby_classes(double precision, double precision, double precision, integer) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION nearby_events(double precision, double precision, double precision, integer)  TO anon, authenticated;

  END IF;
END $$;
