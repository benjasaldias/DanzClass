-- ============================================================
-- 062_fix_2x_payment_assignee.sql
-- ------------------------------------------------------------
-- Repara `class_2x_requests.payment_assignee`, que NUNCA se creó.
--
-- Historia del bug (encontrado en la sesión 2026-07-27, marketplace v2 S2, al
-- probar el pago 2x contra el stack local):
--   * `002_subscriptions_friends_2x.sql` crea `class_2x_requests` SIN la
--     columna `payment_assignee`.
--   * `013_2x_requests.sql` la vuelve a declarar con `CREATE TABLE IF NOT
--     EXISTS ... payment_assignee UUID ...` → como la tabla YA existe, Postgres
--     salta el statement COMPLETO (el IF NOT EXISTS es de la tabla, no de las
--     columnas). La columna nunca se agrega.
--   * Es el mismo patrón de bug de reproducibilidad ya visto en 006 / 035 /
--     049–051: solo se ve al replayear el historial desde cero, que es
--     exactamente lo que hacen `supabase start` y `db reset`.
--
-- Impacto: todo el flujo 2x depende de esta columna.
--   - `/api/class-2x/match` la escribe al emparejar, pero ignora el error del
--     UPDATE → el match "funciona" y el turno de pago queda sin asignar.
--   - `/api/class-2x/transfer-payment` compara `payment_assignee !== user.id`
--     → con la columna ausente (o NULL) siempre responde 403.
--   - `/api/mercadopago/create-payment` (esta sesión) la necesita para saber
--     quién de los dos puede pagar el 2x por Mercado Pago.
--
-- Idempotente y aditiva. En producción es un no-op si la columna ya existe
-- (posible si en algún momento se agregó a mano por el SQL editor).
--
-- ⚠️ Verificar en producción antes de asumir que el 2x funciona ahí:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='class_2x_requests' AND column_name='payment_assignee';
--
-- ROLLBACK:
--   ALTER TABLE class_2x_requests DROP COLUMN IF EXISTS payment_assignee;
-- ============================================================

ALTER TABLE class_2x_requests
  ADD COLUMN IF NOT EXISTS payment_assignee UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Backfill defensivo: en un emparejamiento ya existente sin turno asignado, el
-- solicitante paga por defecto (misma regla que /api/class-2x/match).
UPDATE class_2x_requests
   SET payment_assignee = user_id
 WHERE status = 'matched' AND payment_assignee IS NULL;
