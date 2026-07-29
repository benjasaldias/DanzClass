-- ============================================================
-- 061_class_payment_methods.sql
-- ------------------------------------------------------------
-- Métodos de pago aceptados POR CLASE (marketplace payments v2).
--
-- Contexto (sesión 2026-07-27, ver marketplace-payments-v2-plan.md §2):
-- hasta ahora la vía de pago la determinaba el TIER DEL ALUMNO: sin plan solo
-- Mercado Pago, con plan también transferencia (`canPayByTransfer`). El modelo
-- nuevo invierte eso: es el PROFESOR quien decide, por clase, qué métodos
-- acepta, y cualquier alumno puede usar cualquiera de los habilitados.
-- La única diferencia por plan pasa a ser económica, no de acceso: pagando por
-- MP, un alumno sin plan paga además la comisión de servicio de DanzClass
-- (2%, tope $700). El profesor recibe siempre el 100% del precio que fijó.
--
-- Columnas nuevas en classes:
--   * accepts_mp       la clase acepta pago in-app por Mercado Pago (split).
--   * accepts_transfer la clase acepta transferencia bancaria + comprobante.
--
-- Ambas DEFAULT true: preserva la disponibilidad de las clases existentes y es
-- coherente con "abrir las dos vías a todos" — no requiere backfill.
--
-- El CHECK evita que una clase quede sin ninguna vía de pago (dejaría la
-- inscripción bloqueada para siempre, sin forma de que el alumno pague).
--
-- ⚠️ Gating adicional en runtime, NO en la constraint: accepts_mp=true no
-- implica que el pago MP esté disponible — el profesor además necesita
-- profiles.mp_connected=true (OAuth Connect, ver 052_teacher_mp_connections).
-- La UI deshabilita el checkbox de MP si no está conectado y
-- /api/mercadopago/create-payment sigue devolviendo teacher_not_connected.
--
-- Aditiva e idempotente (replayable desde cero: ver "Entorno de desarrollo
-- local" en CLAUDE.md). No borra datos.
--
-- ROLLBACK:
--   ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_payment_method_check;
--   ALTER TABLE classes
--     DROP COLUMN IF EXISTS accepts_mp,
--     DROP COLUMN IF EXISTS accepts_transfer;
-- ============================================================

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS accepts_mp BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS accepts_transfer BOOLEAN NOT NULL DEFAULT true;

-- ADD CONSTRAINT no soporta IF NOT EXISTS en Postgres: se guarda con un DO
-- block para que la migración sea replayable (patrón de 047/052).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'classes'::regclass
      AND conname = 'classes_payment_method_check'
  ) THEN
    ALTER TABLE classes
      ADD CONSTRAINT classes_payment_method_check
      CHECK (accepts_mp OR accepts_transfer);
  END IF;
END
$$;
