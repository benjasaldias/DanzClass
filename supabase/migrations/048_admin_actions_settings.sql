-- ============================================================
-- 048_admin_actions_settings.sql
-- ------------------------------------------------------------
-- Permite auditar cambios de app_settings (ej: auto_confirm_enabled,
-- ver 047_payment_scanning.sql) en admin_actions.
--
-- admin_actions (027) solo aceptaba action_type IN ('delete_content',
-- 'dismiss_report') y target_id UUID. Un settings key como
-- 'auto_confirm_enabled' no es un UUID, así que hacen falta dos cambios:
--
--   A. Ampliar el CHECK de action_type con 'update_setting'.
--   B. Cambiar target_id de UUID a TEXT (los UUID existentes castean
--      a texto sin pérdida, así que es retrocompatible).
--
-- Aditiva, no borra datos existentes.
--
-- ROLLBACK:
--   ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
--   ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
--     CHECK (action_type IN ('delete_content', 'dismiss_report'));
--   -- Nota: revertir target_id a UUID solo es seguro si no se insertaron
--   -- filas con target_id no-UUID (ej. 'auto_confirm_enabled') todavía.
--   ALTER TABLE admin_actions ALTER COLUMN target_id TYPE UUID USING target_id::uuid;
-- ============================================================

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
  CHECK (action_type IN ('delete_content', 'dismiss_report', 'update_setting'));

ALTER TABLE admin_actions ALTER COLUMN target_id TYPE TEXT USING target_id::text;
