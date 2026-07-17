-- ============================================================
-- 047_payment_scanning.sql
-- ------------------------------------------------------------
-- Escaneo de comprobantes de transferencia (data model + settings).
-- Sesión 2026-07-16. SOLO modelo de datos y settings — sin UI ni
-- servicios de IA (esos vienen en sesiones posteriores).
--
-- Cambios:
--   A. Columnas nuevas en `payments` para el pipeline de escaneo.
--      NOTA: `receipt_url` YA existía en `payments` (001) — se reutiliza,
--      no se agrega ni se altera.
--   B. `recipient_teacher_id` denormalizado en `payments` + backfill.
--      Necesario porque el "profesor destinatario" vive en
--      classes.teacher_id (dos joins desde payments) y un índice único
--      parcial NO puede hacer joins.
--   C. Índice único parcial (recipient_teacher_id, operation_number)
--      para bloquear comprobantes reutilizados contra el mismo profesor.
--      El servicio (próxima sesión) captura el error 23505 y marca el
--      comprobante como reutilizado.
--   D. Tabla `app_settings` (key/value) con la fila `auto_confirm_enabled`.
--      RLS: solo service role (patrón `admin_actions`).
--   E. `profiles.ai_scan_preference` — preferencia por profesor.
--      NULL = "no respondida aún" (la UI lo exigirá al dictar). CHECK
--      solo valida cuando no es NULL.
--
-- RLS de `payments`: SIN cambios. Las policies existentes ya cubren:
--   - estudiante ve/edita solo sus propios pagos (payments_insert_student,
--     payments_select_own via student_id)
--   - profesor ve/edita solo pagos de sus clases (payments_select_own,
--     payments_update_teacher via classes.teacher_id)
--   - admin: opera vía createAdminClient() (service role, bypassea RLS) —
--     no existe identidad de admin en la BD (solo SUPERADMIN_USER_ID env).
--   - scan/auto-confirmación AI: también vía service role.
--
-- Aditiva e idempotente. No borra ni altera columnas existentes.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS payments_op_dedup;
--   ALTER TABLE payments
--     DROP COLUMN IF EXISTS scan_status,
--     DROP COLUMN IF EXISTS scan_result,
--     DROP COLUMN IF EXISTS ai_verdict,
--     DROP COLUMN IF EXISTS confirmed_by,
--     DROP COLUMN IF EXISTS confirmed_at,
--     DROP COLUMN IF EXISTS operation_number,
--     DROP COLUMN IF EXISTS recipient_teacher_id;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS ai_scan_preference;
--   DROP TABLE IF EXISTS app_settings;
-- ============================================================

-- ------------------------------------------------------------
-- A. Columnas de escaneo en `payments`
-- ------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'scanned', 'failed', 'skipped'));

-- scan_result: { fields: {...}, confidence: {...}, issues: [...] }
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS scan_result JSONB;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS ai_verdict TEXT NOT NULL DEFAULT 'none'
    CHECK (ai_verdict IN ('clean', 'issue', 'none'));

-- confirmed_by: quién confirmó el pago. NULL = aún no confirmado.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT
    CHECK (confirmed_by IN ('ai', 'teacher', 'admin'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- operation_number: nº de operación de la transferencia (para deduplicar).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS operation_number TEXT;

-- ------------------------------------------------------------
-- B. Denormalización del profesor destinatario + backfill
-- ------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS recipient_teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Backfill de pagos existentes: recipient_teacher_id = teacher de la clase
-- del enrollment. Idempotente (solo rellena los que están en NULL).
UPDATE payments p
SET recipient_teacher_id = c.teacher_id
FROM enrollments e
JOIN classes c ON c.id = e.class_id
WHERE e.id = p.enrollment_id
  AND p.recipient_teacher_id IS NULL;

-- ------------------------------------------------------------
-- C. Índice único parcial de deduplicación
-- ------------------------------------------------------------
-- Un mismo nº de operación no puede insertarse dos veces contra el mismo
-- profesor destinatario. Parcial: solo aplica cuando ambos están presentes,
-- de modo que pagos sin operation_number (aún no escaneados) no chocan.
CREATE UNIQUE INDEX IF NOT EXISTS payments_op_dedup
  ON payments (recipient_teacher_id, operation_number)
  WHERE operation_number IS NOT NULL AND recipient_teacher_id IS NOT NULL;

-- ------------------------------------------------------------
-- D. Setting global de admin: app_settings (key/value)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fila inicial: auto-confirmación deshabilitada por defecto (conservador).
INSERT INTO app_settings (key, value)
VALUES ('auto_confirm_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Sin policies: nadie lee ni escribe desde el cliente. Solo el service role
-- (createAdminClient, que bypassea RLS) toca esta tabla. Igual que admin_actions.

-- ------------------------------------------------------------
-- E. Preferencia de escaneo por profesor
-- ------------------------------------------------------------
-- NULL = no respondida (la UI la exigirá antes/al dictar). El CHECK solo
-- valida los valores permitidos cuando la columna no es NULL.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_scan_preference TEXT
    CHECK (ai_scan_preference IN ('ai', 'manual'));
