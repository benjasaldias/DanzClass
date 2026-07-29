-- ============================================================
-- 070_payment_platform_hardening.sql
-- ------------------------------------------------------------
-- Soporte de esquema para la sesión S5 del audit ("Endurecimiento de la
-- plataforma de pagos"). Son cuatro cambios pequeños e independientes; ninguno
-- toca datos existentes.
--
-- 1. `payments.status = 'refunded'` (P2-6). Hoy un reembolso o un contracargo de
--    Mercado Pago no revierte nada: el webhook, tras el `approved`, sólo
--    persiste `mp_status`. El alumno paga, obtiene el QR, pide el reembolso y
--    conserva el acceso. La reversión necesita un estado propio: 'rejected'
--    significa "el profesor miró el comprobante y lo rechazó" y 'void'
--    significa "el pago dejó de aplicar porque la inscripción se anuló" — un
--    reembolso no es ninguna de las dos. Al no ser 'verified', sale solo del
--    Panel Financiero y de la conciliación, que filtran por ese estado.
--
-- 2. `payments.mp_fee_amount` (D-2). El costo de procesamiento se le cobra al
--    alumno con el tramo MÁS CARO de Mercado Pago (disponibilidad inmediata,
--    3,19% + IVA) porque la API de MP no expone el plazo de liberación de cada
--    cuenta. Si el profesor tiene liberación a 10 o 30 días, MP cobra menos y la
--    diferencia queda en DanzClass. El audit lo señala con razón: "lo que no
--    sirve es que exista sin nombre". El webhook sí recibe el costo REAL en
--    `fee_details` de cada pago aprobado, así que se persiste acá y el excedente
--    queda visible y contabilizable en el panel de conciliación de /admin.
--    NULL = pago no-MP, o pago MP anterior a esta migración.
--
-- 3. `teacher_mp_connections.expiry_notified_at` / `refresh_failed_at` (P1-1).
--    Los access tokens de MP Connect vencen (180 días). Hasta ahora
--    `refresh_token` y `expires_at` se guardaban y NUNCA se leían: al vencer,
--    todos los pagos in-app de ese profesor dejaban de funcionar en silencio.
--    El refresh automático vive en `lib/mercadopago/token.ts`; estas dos
--    columnas son el rastro que necesita el cron diario para avisar una sola vez
--    (y no todos los días) cuando el refresh falla y la conexión está por vencer.
--
-- 4. Dos tipos de notificación nuevos: `mp_connection_expiring` (al profesor,
--    desde el cron de conexiones) y `payment_refunded` (al alumno y al profesor
--    cuando MP revierte un pago). El CHECK se reescribe COMPLETO, como en cada
--    migración que lo toca: la lista de abajo debe coincidir con
--    `NotificationType` en packages/shared/src/types/index.ts.
--
-- Aditiva e idempotente. No borra ni modifica filas.
--
-- ROLLBACK:
--   -- (1) requiere decidir qué hacer con los pagos ya reembolsados; dejarlos en
--   -- 'refunded' haría fallar el CHECK viejo, y volverlos a 'verified' los
--   -- reingresaría a la contabilidad como cobros vigentes:
--   --   UPDATE payments SET status = 'void' WHERE status = 'refunded';
--   ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
--   ALTER TABLE payments ADD CONSTRAINT payments_status_check
--     CHECK (status IN ('due', 'pending', 'verified', 'rejected', 'void'));
--   ALTER TABLE payments DROP COLUMN IF EXISTS mp_fee_amount;
--   ALTER TABLE teacher_mp_connections DROP COLUMN IF EXISTS expiry_notified_at;
--   ALTER TABLE teacher_mp_connections DROP COLUMN IF EXISTS refresh_failed_at;
--   -- y restaurar el CHECK de notificaciones de 060_post_plan_visibility.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estado 'refunded' en payments
-- ------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('due', 'pending', 'verified', 'rejected', 'void', 'refunded'));

-- ------------------------------------------------------------
-- 2. Costo real de procesamiento cobrado por Mercado Pago
-- ------------------------------------------------------------
-- En CLP enteros, tal como lo reporta MP en `fee_details[].amount` del pago
-- aprobado (se suman todos los cargos de MP, excluida la `application_fee`, que
-- es la comisión de DanzClass y ya vive en `commission_amount`).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mp_fee_amount INTEGER;

COMMENT ON COLUMN payments.mp_fee_amount IS
  'Costo real de procesamiento cobrado por Mercado Pago (CLP). NULL en pagos por transferencia. El excedente contra el tramo estimado se concilia en /admin.';

-- ------------------------------------------------------------
-- 3. Rastro del refresh de tokens OAuth
-- ------------------------------------------------------------
ALTER TABLE teacher_mp_connections
  ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ;
ALTER TABLE teacher_mp_connections
  ADD COLUMN IF NOT EXISTS refresh_failed_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 4. Tipos de notificación
-- ------------------------------------------------------------
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
  'event_invite', 'event_invite_accepted', 'event_invite_rejected',
  'posts_expiring',
  'mp_connection_expiring', 'payment_refunded'
));
