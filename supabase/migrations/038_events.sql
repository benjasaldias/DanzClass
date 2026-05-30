-- 038_events.sql
-- Eventos: batallas de baile, masterclasses y otros eventos comunitarios.
-- Los organizadores pueden invitar profesores; seguidores de profes aceptados ven el evento.
-- Soporte para cupos opcionales y entrada pagada.

-- ── Tabla principal ──────────────────────────────────────────────────────────

CREATE TABLE events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  event_type   TEXT        NOT NULL DEFAULT 'otro'
                           CHECK (event_type IN ('batalla', 'masterclass', 'otro')),
  event_date   DATE        NOT NULL,
  event_time   TEXT,                          -- HH:MM (texto libre, ej. "19:00")
  city         TEXT,
  cover_url    TEXT,
  has_spots    BOOLEAN     NOT NULL DEFAULT false,
  max_spots    INTEGER     CHECK (max_spots > 0),
  has_entry    BOOLEAN     NOT NULL DEFAULT false,
  entry_price  INTEGER     CHECK (entry_price >= 0),  -- CLP
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'cancelled', 'finished')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Invitaciones a profesores ────────────────────────────────────────────────

CREATE TABLE event_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  teacher_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, teacher_id)
);

-- ── Inscripciones de asistentes ──────────────────────────────────────────────

CREATE TABLE event_enrollments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- ── Comprobantes de pago de entrada ─────────────────────────────────────────

CREATE TABLE event_payments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID        NOT NULL REFERENCES event_enrollments(id) ON DELETE CASCADE,
  event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount        INTEGER     NOT NULL CHECK (amount >= 0),
  receipt_url   TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'submitted', 'verified', 'void')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Vista de cupos ───────────────────────────────────────────────────────────

CREATE VIEW event_spots AS
  SELECT
    e.id AS event_id,
    e.max_spots,
    COUNT(er.id) FILTER (WHERE er.status != 'cancelled') AS enrolled_count,
    GREATEST(0,
      COALESCE(e.max_spots, 0) -
      COUNT(er.id) FILTER (WHERE er.status != 'cancelled')
    ) AS available_spots
  FROM events e
  LEFT JOIN event_enrollments er ON er.event_id = e.id
  GROUP BY e.id, e.max_spots;

-- ── Trigger updated_at ───────────────────────────────────────────────────────

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

-- events: públicos para leer, solo el creator puede modificar
CREATE POLICY "events_select_all"       ON events FOR SELECT USING (true);
CREATE POLICY "events_insert_auth"      ON events FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "events_update_creator"   ON events FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "events_delete_creator"   ON events FOR DELETE USING (auth.uid() = creator_id);

-- event_invites: creator ve todas las de su evento, teacher ve las suyas
CREATE POLICY "invites_select"          ON event_invites FOR SELECT USING (
  auth.uid() = teacher_id OR
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);
CREATE POLICY "invites_insert_creator"  ON event_invites FOR INSERT WITH CHECK (
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);
CREATE POLICY "invites_update_teacher"  ON event_invites FOR UPDATE USING (
  auth.uid() = teacher_id
);

-- event_enrollments: creator y propio alumno pueden ver
CREATE POLICY "enrollments_select"      ON event_enrollments FOR SELECT USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);
CREATE POLICY "enrollments_insert_self" ON event_enrollments FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY "enrollments_update"      ON event_enrollments FOR UPDATE USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);

-- event_payments: creator y propio usuario pueden ver
CREATE POLICY "event_payments_select"          ON event_payments FOR SELECT USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);
CREATE POLICY "event_payments_insert_self"     ON event_payments FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY "event_payments_update_creator"  ON event_payments FOR UPDATE USING (
  auth.uid() = (SELECT creator_id FROM events WHERE id = event_id)
);

-- ── Storage bucket event-media ───────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_media_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-media');

CREATE POLICY "event_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'event-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "event_media_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'event-media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Notification types ───────────────────────────────────────────────────────
-- Reescribe constraint completo incluyendo todos los tipos anteriores (023 en adelante)

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report',
  'audition_accepted', 'audition_rejected', 'new_audition',
  'class_reminder', 'waitlist_available',
  'rehearsal_invite', 'rehearsal_accepted', 'rehearsal_rejected',
  'payment_reminder',
  'event_invite', 'event_invite_accepted', 'event_invite_rejected'
));
