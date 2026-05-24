-- Ensayos: nuevo tipo de compromiso sin precio, basado en invitaciones
-- Tablas: rehearsals, rehearsal_invites
-- Nuevos notification types: rehearsal_invite, rehearsal_accepted, rehearsal_rejected

-- 1. Extiende constraint de notification_type con los nuevos tipos
--    IMPORTANTE: incluye todos los tipos existentes de migraciones anteriores
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report',
  'audition_accepted', 'audition_rejected', 'new_audition',
  'class_reminder', 'waitlist_available',
  'rehearsal_invite', 'rehearsal_accepted', 'rehearsal_rejected'
));

-- 2. Tabla de ensayos
--    date_mode:
--      'single'     → fecha única (rehearsal_date + rehearsal_time)
--      'custom'     → múltiples fechas (custom_dates[])
--      'coordinate' → coordinar con integrantes (coordinate_month YYYY-MM)
CREATE TABLE IF NOT EXISTS rehearsals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  description       TEXT,
  city              TEXT,
  location          TEXT,
  date_mode         TEXT        NOT NULL DEFAULT 'single'
                                CHECK (date_mode IN ('single', 'custom', 'coordinate')),
  rehearsal_date    DATE,
  rehearsal_time    TIME,
  custom_dates      TEXT[],
  coordinate_month  TEXT,       -- formato YYYY-MM
  duration_minutes  INTEGER     NOT NULL DEFAULT 60,
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de invitaciones (debe existir ANTES de crear la política que la referencia)
CREATE TABLE IF NOT EXISTS rehearsal_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_id  UUID        NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rehearsal_id, user_id)
);

-- RLS rehearsals
ALTER TABLE rehearsals ENABLE ROW LEVEL SECURITY;

-- El creador puede hacer cualquier cosa
CREATE POLICY "rehearsals_creator_all" ON rehearsals
  FOR ALL
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Los invitados pueden leer (SELECT únicamente)
-- rehearsal_invites ya existe en este punto
CREATE POLICY "rehearsals_invitees_select" ON rehearsals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rehearsal_invites
      WHERE rehearsal_id = rehearsals.id
        AND user_id = auth.uid()
    )
  );

-- RLS rehearsal_invites
ALTER TABLE rehearsal_invites ENABLE ROW LEVEL SECURITY;

-- El invitado ve sus propias invitaciones y puede actualizar su estado
CREATE POLICY "rehearsal_invites_own" ON rehearsal_invites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- El creador del ensayo puede ver y gestionar todas las invitaciones de sus ensayos
CREATE POLICY "rehearsal_invites_creator" ON rehearsal_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rehearsals
      WHERE id = rehearsal_id
        AND creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rehearsals
      WHERE id = rehearsal_id
        AND creator_id = auth.uid()
    )
  );

-- 4. Trigger updated_at para rehearsals
CREATE OR REPLACE FUNCTION update_rehearsal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rehearsals_updated_at
  BEFORE UPDATE ON rehearsals
  FOR EACH ROW EXECUTE FUNCTION update_rehearsal_updated_at();
