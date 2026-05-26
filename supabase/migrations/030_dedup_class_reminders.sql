-- Sesión 2026-05-28 (alpha-04) — D-4
-- Previene class_reminder duplicado si el cron corre 2 veces en el mismo día.
-- Crea un índice ÚNICO parcial sobre (user_id, class_id, día del envío) solo para tipo class_reminder.
-- El cron sigue haciendo un pre-check via SELECT para minimizar inserts conflictivos, pero ahora el DB rechaza duplicados como red de seguridad.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_class_reminder
ON notifications (
  user_id,
  type,
  (data->>'class_id'),
  ((created_at AT TIME ZONE 'America/Santiago')::date)
)
WHERE type = 'class_reminder';
