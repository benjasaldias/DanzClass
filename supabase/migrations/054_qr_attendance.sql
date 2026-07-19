-- ============================================================
-- 054_qr_attendance.sql
-- ------------------------------------------------------------
-- QR de asistencia atados a pagos confirmados (sesión 2026-07-18).
--
-- Contexto: cuando el pago de una inscripción pasa a 'verified' (los tres
-- caminos convergen en autoConfirmPayment() → lib/payments.ts: profesor,
-- IA, o webhook de Mercado Pago), se emite UN token QR por inscripción.
-- El profesor lo escanea para registrar la asistencia del alumno a una
-- fecha de clase. El token es opaco y no forjable: su valor es un HMAC-SHA256
-- (con secreto de servidor QR_TOKEN_SECRET, NUNCA en la DB) sobre
-- enrollment_id + student_id + nonce. El nonce aleatorio por token añade
-- entropía y permite rotar el token al reactivar una inscripción.
--
-- Modelo de sesión: las inscripciones de DanzClass son GLOBALES a la clase
-- (enrollments.session_id es siempre NULL; class_sessions está muerta), así
-- que la asistencia se indexa por session_date DATE, no por session_id.
-- UNIQUE(qr_token_id, session_date) impide doble check-in en la misma fecha.
--
-- Revocación = SOFT (status='revoked' + revoked_at), no DELETE: la asistencia
-- es prueba de servicio prestado y debe preservarse. Consistente con el patrón
-- soft-delete app-wide (status='cancelled' en classes/enrollments). El endpoint
-- de validación (sesión futura) DEBE chequear status='active' + enrollment aún
-- 'confirmed'. attendance denormaliza student_id/class_id para que la fila
-- histórica sobreviva self-contained aunque el token rote/se purgue.
--
-- RLS: patrón app_settings/teacher_mp_connections — RLS ON, escritura solo por
-- service role (emisión/revocación/validación vía admin client). Al cliente
-- solo se le da SELECT acotado: el alumno ve su token/asistencia; el profesor
-- ve la asistencia de sus clases (valida tokens por endpoint, no por lectura).
--
-- Aditiva. No borra datos.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS attendance;
--   DROP TABLE IF EXISTS qr_tokens;
-- ============================================================

-- ------------------------------------------------------------
-- qr_tokens — un token por inscripción (UNIQUE enrollment_id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,   -- opaco, HMAC-derivado; lo que porta el QR
  nonce         TEXT NOT NULL,          -- aleatorio por token (entropía + rotación)
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS qr_tokens_student_id_idx ON qr_tokens (student_id);
CREATE INDEX IF NOT EXISTS qr_tokens_class_id_idx ON qr_tokens (class_id);

-- ------------------------------------------------------------
-- attendance — un check-in por token y fecha de sesión
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_token_id   UUID NOT NULL REFERENCES qr_tokens(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- denormalizado (histórico)
  class_id      UUID REFERENCES classes(id) ON DELETE SET NULL,   -- denormalizado (RLS + histórico)
  session_date  DATE NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- profesor que escaneó
  UNIQUE (qr_token_id, session_date)
);

CREATE INDEX IF NOT EXISTS attendance_class_session_idx ON attendance (class_id, session_date);
CREATE INDEX IF NOT EXISTS attendance_student_id_idx ON attendance (student_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- qr_tokens: el alumno ve SOLO su token. Sin policies de escritura →
-- emisión/revocación solo por service role (admin client). El profesor NO lee
-- tokens directo: valida vía endpoint (sesión futura) con service role.
DROP POLICY IF EXISTS "qr_tokens_select_own" ON qr_tokens;
CREATE POLICY "qr_tokens_select_own" ON qr_tokens
  FOR SELECT USING (student_id = auth.uid());

-- attendance: el alumno ve su asistencia; el profesor ve la de sus clases.
-- Escritura solo por service role (endpoint de validación).
DROP POLICY IF EXISTS "attendance_select_student_or_teacher" ON attendance;
CREATE POLICY "attendance_select_student_or_teacher" ON attendance
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = attendance.class_id AND c.teacher_id = auth.uid()
    )
  );
