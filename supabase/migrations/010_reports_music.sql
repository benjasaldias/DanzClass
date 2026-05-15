-- ============================================================
-- 010_reports_music.sql
-- Tabla de denuncias de contenido (posts y clases)
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'class')),
  content_id   UUID NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('copyright', 'inappropriate', 'spam', 'other')),
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- Un usuario no puede reportar el mismo contenido dos veces
  UNIQUE (reporter_id, content_type, content_id)
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede insertar un reporte propio
CREATE POLICY "reports_insert_own" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Cada usuario solo ve sus propios reportes
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());
