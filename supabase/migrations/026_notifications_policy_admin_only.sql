-- ============================================================
-- Migration 026: lock down notifications INSERT policy
-- ============================================================
-- Hasta ahora la policy `notifications_insert_any` permitía a cualquier
-- usuario autenticado insertar notificaciones para CUALQUIER otro user_id.
-- Eso habilitaba spoofing de tipos sensibles (payment_confirmed,
-- audition_accepted, etc.) directamente desde DevTools.
--
-- A partir de esta migración, las inserciones cross-user pasan por
-- /api/notifications/send (que valida la relación sender↔contenido y usa
-- service role para insertar). El cliente solo puede insertar
-- notificaciones para sí mismo (caso poco común, pero permitido).
-- ============================================================

DROP POLICY IF EXISTS "notifications_insert_any" ON notifications;
DROP POLICY IF EXISTS notifications_insert_any ON notifications;

CREATE POLICY "notifications_insert_self" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
