-- ============================================================
-- 053_payment_marketplace_fields.sql
-- ------------------------------------------------------------
-- Campos de pago para el modelo marketplace (split de Mercado Pago).
--
-- Contexto (sesión 2026-07-17): un alumno SIN plan paga la clase in-app por
-- Mercado Pago; DanzClass retiene una comisión (2%, tope $700) y el resto va
-- directo a la cuenta MP del profesor vía split (ver 052_teacher_mp_connections).
-- Con split NO hay payout manual: MP liquida a cada parte en origen, por eso NO
-- hace falta una tabla de payouts — basta registrar la comisión en cada pago
-- para la contabilidad/impuestos de la plataforma.
--
-- Semántica de montos (importante):
--   * amount            = base = precio de la clase = lo que recibe el PROFESOR.
--                         (No cambia: el panel Financiero suma payments.amount
--                          como ingreso del profe y debe seguir siendo correcto.)
--   * commission_amount = comisión que retiene DanzClass (0 en transferencia).
--   * total cobrado al alumno (solo 'mp') = amount + commission_amount, que es
--     también el marketplace_fee = commission_amount enviado a MP.
--
-- Columnas nuevas en payments:
--   * payment_method   'transfer' | 'mp' (default 'transfer' → los pagos
--                      históricos son todos transferencias).
--   * commission_amount INTEGER (CLP) retenido por la plataforma; default 0.
--   * mp_payment_id    id del pago en Mercado Pago (lookup + idempotencia del
--                      webhook). Índice único parcial para deduplicar reenvíos.
--   * mp_status        estado crudo devuelto por MP (approved/pending/rejected/
--                      refunded/…), para auditoría.
--
-- Aditiva e idempotente. No borra datos. recipient_teacher_id ya existe (047).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS payments_mp_payment_id_key;
--   ALTER TABLE payments
--     DROP COLUMN IF EXISTS payment_method,
--     DROP COLUMN IF EXISTS commission_amount,
--     DROP COLUMN IF EXISTS mp_payment_id,
--     DROP COLUMN IF EXISTS mp_status;
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'transfer'
    CHECK (payment_method IN ('transfer', 'mp'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS commission_amount INTEGER NOT NULL DEFAULT 0
    CHECK (commission_amount >= 0);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mp_status TEXT;

-- Idempotencia del webhook: un mismo pago de MP no puede quedar registrado dos
-- veces (MP reenvía notificaciones). Índice único parcial (solo filas con id).
CREATE UNIQUE INDEX IF NOT EXISTS payments_mp_payment_id_key
  ON payments (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
