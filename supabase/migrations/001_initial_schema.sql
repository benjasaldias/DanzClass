-- ============================================================
-- DanceClass - Initial Schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- for location queries (optional, can skip if not available)

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  city TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEACHER PAYMENT INFO (datos bancarios para transferencias)
-- ============================================================
CREATE TABLE teacher_payment_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cuenta_corriente', 'cuenta_vista', 'cuenta_rut', 'cuenta_ahorro')),
  account_number TEXT NOT NULL,
  rut TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- ============================================================
-- CLASSES (publicaciones de clases)
-- ============================================================
CREATE TABLE classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('suelta', 'periodica')),
  dance_style TEXT,
  level TEXT CHECK (level IN ('principiante', 'intermedio', 'avanzado', 'todos')) DEFAULT 'todos',

  -- Para clases sueltas (fecha/hora específica)
  date DATE,
  time TIME,

  -- Para clases periódicas
  recurrence TEXT CHECK (recurrence IN ('weekly', 'biweekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Lunes...
  recurring_time TIME,

  -- Común
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  location_name TEXT,
  location_address TEXT,
  city TEXT,
  max_spots INTEGER NOT NULL,
  price INTEGER NOT NULL, -- en CLP (pesos chilenos)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLASS MEDIA (fotos y videos adjuntos a la publicación)
-- ============================================================
CREATE TABLE class_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLASS SESSIONS (ocurrencias específicas de clases periódicas)
-- ============================================================
CREATE TABLE class_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  discount_percentage INTEGER CHECK (discount_percentage BETWEEN 0 AND 100),
  notes TEXT, -- para descuentos o cambios de último minuto
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENROLLMENTS (inscripciones / reserva de cupos)
-- ============================================================
CREATE TABLE enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES class_sessions(id) ON DELETE CASCADE, -- NULL para clases sueltas
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, class_id, session_id)
);

-- ============================================================
-- PAYMENTS (comprobantes de pago)
-- ============================================================
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE UNIQUE NOT NULL,
  amount INTEGER NOT NULL, -- en CLP
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT
);

-- ============================================================
-- VIEWS útiles
-- ============================================================

-- Vista: cupos disponibles por clase
CREATE VIEW class_spots AS
SELECT
  c.id AS class_id,
  c.max_spots,
  COUNT(e.id) FILTER (WHERE e.status != 'cancelled') AS spots_taken,
  c.max_spots - COUNT(e.id) FILTER (WHERE e.status != 'cancelled') AS spots_available
FROM classes c
LEFT JOIN enrollments e ON e.class_id = c.id AND e.session_id IS NULL
GROUP BY c.id, c.max_spots;

-- Vista: cupos disponibles por sesión
CREATE VIEW session_spots AS
SELECT
  cs.id AS session_id,
  cs.class_id,
  c.max_spots,
  COUNT(e.id) FILTER (WHERE e.status != 'cancelled') AS spots_taken,
  c.max_spots - COUNT(e.id) FILTER (WHERE e.status != 'cancelled') AS spots_available
FROM class_sessions cs
JOIN classes c ON c.id = cs.class_id
LEFT JOIN enrollments e ON e.session_id = cs.id
GROUP BY cs.id, cs.class_id, c.max_spots;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_payment_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- TEACHER_PAYMENT_INFO policies
CREATE POLICY "payment_info_select_all" ON teacher_payment_info FOR SELECT USING (true);
CREATE POLICY "payment_info_insert_own" ON teacher_payment_info
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "payment_info_update_own" ON teacher_payment_info
  FOR UPDATE USING (auth.uid() = teacher_id);

-- FOLLOWS policies
CREATE POLICY "follows_select_all" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_own" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- CLASSES policies
CREATE POLICY "classes_select_active" ON classes FOR SELECT USING (status = 'active' OR teacher_id = auth.uid());
CREATE POLICY "classes_insert_teacher" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() = teacher_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );
CREATE POLICY "classes_update_teacher" ON classes
  FOR UPDATE USING (auth.uid() = teacher_id);
CREATE POLICY "classes_delete_teacher" ON classes
  FOR DELETE USING (auth.uid() = teacher_id);

-- CLASS_MEDIA policies
CREATE POLICY "media_select_all" ON class_media FOR SELECT USING (true);
CREATE POLICY "media_insert_teacher" ON class_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );
CREATE POLICY "media_delete_teacher" ON class_media
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );

-- CLASS_SESSIONS policies
CREATE POLICY "sessions_select_all" ON class_sessions FOR SELECT USING (true);
CREATE POLICY "sessions_insert_teacher" ON class_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );
CREATE POLICY "sessions_update_teacher" ON class_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );

-- ENROLLMENTS policies
CREATE POLICY "enrollments_select_own" ON enrollments
  FOR SELECT USING (
    student_id = auth.uid() OR
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );
CREATE POLICY "enrollments_insert_student" ON enrollments
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "enrollments_update_own" ON enrollments
  FOR UPDATE USING (
    student_id = auth.uid() OR
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
  );

-- PAYMENTS policies
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN classes c ON c.id = e.class_id
      WHERE e.id = enrollment_id
      AND (e.student_id = auth.uid() OR c.teacher_id = auth.uid())
    )
  );
CREATE POLICY "payments_insert_student" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments WHERE id = enrollment_id AND student_id = auth.uid()
    )
  );
CREATE POLICY "payments_update_teacher" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM enrollments e
      JOIN classes c ON c.id = e.class_id
      WHERE e.id = enrollment_id AND c.teacher_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STORAGE BUCKETS (ejecutar en Supabase Dashboard)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('class-media', 'class-media', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('payment-receipts', 'payment-receipts', false);
