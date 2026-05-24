-- Disponibilidad horaria del usuario
-- Modelo: el usuario marca bloques que está OCUPADO. Todo lo no marcado se considera libre.
-- El sueño se configura por hora de inicio y fin; se superpone automáticamente en la UI.

-- 1. Configuración de sueño en profiles
--    sleep_start / sleep_end: hora en formato 0-23
--    Default 00:00 a 08:00 (sleep_start=0, sleep_end=8)
--    Si sleep_start > sleep_end: cruza medianoche (ej. 23 a 07)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sleep_start SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sleep_end   SMALLINT NOT NULL DEFAULT 8;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_sleep_start_check CHECK (sleep_start BETWEEN 0 AND 23),
  ADD CONSTRAINT profiles_sleep_end_check   CHECK (sleep_end   BETWEEN 0 AND 23);

-- 2. Tabla de bloques ocupados (1 hora de granularidad)
--    weekday: 0=Lunes ... 6=Domingo  (consistente con la UI de agenda)
--    hour: 0-23
CREATE TABLE IF NOT EXISTS user_busy_blocks (
  id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  weekday    SMALLINT NOT NULL,
  hour       SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_busy_blocks_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT user_busy_blocks_hour_check    CHECK (hour    BETWEEN 0 AND 23),
  UNIQUE (user_id, weekday, hour)
);

ALTER TABLE user_busy_blocks ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo puede ver y editar sus propios bloques
CREATE POLICY "busy_blocks_own" ON user_busy_blocks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
