-- ============================================================
-- DanceClass - Migration 002: Subscriptions, Friends, 2x
-- ============================================================

-- ============================================================
-- 1. PROFILES: cambiar role de 'teacher'/'student' a 'user'
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
UPDATE profiles SET role = 'user';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user'));

-- Actualizar trigger para que siempre cree perfil con role='user'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tier         TEXT NOT NULL CHECK (tier IN ('basic', 'teacher', 'pro')),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'grace', 'expired', 'cancelled')),
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  mp_subscription_id  TEXT,  -- Mercado Pago subscription ID (webhook lo rellena)
  mp_preapproval_id   TEXT,  -- Mercado Pago preapproval ID
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para obtener el tier efectivo de un usuario.
-- Considera grace period de 7 días después del vencimiento.
CREATE OR REPLACE FUNCTION get_user_tier(user_id UUID)
RETURNS TEXT AS $$
  SELECT COALESCE(
    (
      SELECT s.tier
      FROM subscriptions s
      WHERE s.user_id = get_user_tier.user_id
        AND s.status IN ('active', 'grace')
        AND s.expires_at + INTERVAL '7 days' > NOW()
      ORDER BY
        CASE s.tier WHEN 'pro' THEN 3 WHEN 'teacher' THEN 2 WHEN 'basic' THEN 1 END DESC
      LIMIT 1
    ),
    'none'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. CLASSES: agregar precio 2x
-- ============================================================
ALTER TABLE classes ADD COLUMN price_2x INTEGER;

-- ============================================================
-- 4. ENROLLMENTS: soporte para inscripciones 2x
-- ============================================================
ALTER TABLE enrollments ADD COLUMN is_2x BOOLEAN DEFAULT FALSE;
ALTER TABLE enrollments ADD COLUMN partner_enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL;

-- ============================================================
-- 5. FRIENDSHIPS
-- ============================================================
CREATE TABLE friendships (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

-- ============================================================
-- 6. CLASS 2X REQUESTS ("busco 2x")
-- ============================================================
CREATE TABLE class_2x_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  class_id      UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  session_id    UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
  matched_with  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'looking'
                  CHECK (status IN ('looking', 'matched', 'cancelled')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, class_id, session_id)
);

-- ============================================================
-- 7. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
                '2x_request', '2x_match',
                'friend_request', 'friend_accepted',
                'payment_confirmed', 'payment_rejected'
              )),
  data        JSONB DEFAULT '{}',
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. RLS — SUBSCRIPTIONS
-- ============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE solo via funciones SECURITY DEFINER (webhooks MP) — no acceso directo

-- ============================================================
-- 9. RLS — FRIENDSHIPS
-- ============================================================
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select_own" ON friendships
  FOR SELECT USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

CREATE POLICY "friendships_insert_requester" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "friendships_update_addressee" ON friendships
  FOR UPDATE USING (auth.uid() = addressee_id);

CREATE POLICY "friendships_delete_own" ON friendships
  FOR DELETE USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- ============================================================
-- 10. RLS — CLASS 2X REQUESTS
-- ============================================================
ALTER TABLE class_2x_requests ENABLE ROW LEVEL SECURITY;

-- El usuario ve sus propias requests + las requests 'looking' de sus amigos
CREATE POLICY "2x_select" ON class_2x_requests
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      status = 'looking'
      AND EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = auth.uid() AND f.addressee_id = user_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = user_id)
          )
      )
    )
  );

CREATE POLICY "2x_insert_own" ON class_2x_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "2x_update_own" ON class_2x_requests
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = matched_with);

CREATE POLICY "2x_delete_own" ON class_2x_requests
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 11. RLS — NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 12. Actualizar RLS de CLASSES: usar subscription tier
-- ============================================================
DROP POLICY "classes_insert_teacher" ON classes;

CREATE POLICY "classes_insert_teacher" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() = teacher_id AND
    get_user_tier(auth.uid()) IN ('teacher', 'pro')
  );

-- ============================================================
-- 13. Vista: amigos aceptados (comodidad para queries)
-- ============================================================
CREATE VIEW accepted_friends AS
SELECT
  requester_id AS user_id,
  addressee_id AS friend_id
FROM friendships WHERE status = 'accepted'
UNION ALL
SELECT
  addressee_id AS user_id,
  requester_id AS friend_id
FROM friendships WHERE status = 'accepted';
