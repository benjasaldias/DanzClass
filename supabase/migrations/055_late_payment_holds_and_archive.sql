-- ============================================================
-- 055_late_payment_holds_and_archive.sql
-- ------------------------------------------------------------
-- Dos features (sesión 2026-07-19):
--
-- (1) ITEM 1 — Archivado a Historial. Una clase pasa a estado 'archived' 24 h
--     después de su última sesión (lo hace el cron cleanup-classes). Archivada =
--     solo tarjeta en el Historial: se le quita el contenido pesado (class_media
--     en Storage) y su página /class devuelve 404. El status CHECK de classes
--     solo permitía ('active','cancelled','completed'); se agrega 'archived'.
--
-- (2) ITEM 3 — Reserva de cupo con lock temporal para clases que NO permiten
--     pagos atrasados. `classes.allow_late_payment` (default true = comportamiento
--     actual). Si es false, al reservar se crea la inscripción con
--     `enrollments.hold_expires_at = now()+10min`: mientras no expire ocupa el
--     cupo (lock); si expira sin que el alumno concrete el pago (subir comprobante
--     → status 'payment_submitted', o pagar por MP → 'confirmed'), el cupo se
--     libera. La liberación es INMEDIATA a nivel de la vista class_spots (excluye
--     holds vencidos), sin depender del cron; el cron solo hace la limpieza
--     (cancelar la fila + anular el pago). El rate-limit de 10 reservas/día por
--     (usuario, clase) vive en la app (limiter `reserve`), no en la DB.
--
-- Aditiva. No borra datos.
--
-- ROLLBACK:
--   ALTER TABLE classes DROP COLUMN IF EXISTS allow_late_payment;
--   ALTER TABLE enrollments DROP COLUMN IF EXISTS hold_expires_at;
--   -- restaurar class_spots a la definición de 001 (sin exclusión de holds);
--   -- restaurar el CHECK de classes.status sin 'archived' (requiere que no haya
--   -- filas en 'archived').
-- ============================================================

-- (1) Estado 'archived' -------------------------------------------------------
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE classes
  ADD CONSTRAINT classes_status_check
  CHECK (status IN ('active', 'cancelled', 'completed', 'archived'));

-- (2) allow_late_payment + hold_expires_at ------------------------------------
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS allow_late_payment BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

-- Índice para que el cron encuentre rápido los holds vencidos a limpiar.
CREATE INDEX IF NOT EXISTS enrollments_hold_expires_idx
  ON enrollments (hold_expires_at)
  WHERE hold_expires_at IS NOT NULL AND status = 'pending_payment';

-- (3) class_spots — excluir holds vencidos ------------------------------------
-- Un hold vencido (status='pending_payment' + hold_expires_at ya pasó) deja de
-- ocupar el cupo INMEDIATAMENTE, sin esperar al cron. Todo lo demás igual que 001.
CREATE OR REPLACE VIEW class_spots AS
SELECT
  c.id AS class_id,
  c.max_spots,
  COUNT(e.id) FILTER (
    WHERE e.status != 'cancelled'
      AND NOT (
        e.status = 'pending_payment'
        AND e.hold_expires_at IS NOT NULL
        AND e.hold_expires_at < now()
      )
  ) AS spots_taken,
  c.max_spots - COUNT(e.id) FILTER (
    WHERE e.status != 'cancelled'
      AND NOT (
        e.status = 'pending_payment'
        AND e.hold_expires_at IS NOT NULL
        AND e.hold_expires_at < now()
      )
  ) AS spots_available
FROM classes c
LEFT JOIN enrollments e ON e.class_id = c.id AND e.session_id IS NULL
GROUP BY c.id, c.max_spots;
