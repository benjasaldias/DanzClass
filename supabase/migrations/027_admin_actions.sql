-- ============================================================
-- Migration 027: admin_actions audit log
-- ============================================================
-- Registra cada acción del panel /admin (delete_content / dismiss_report)
-- para tener trazabilidad. RLS bloquea inserts/selects desde clientes;
-- solo el service role (vía /api/admin/*) puede escribir y leer.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('delete_content', 'dismiss_report')),
  target_table TEXT,
  target_id UUID,
  report_id UUID,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_admin_id_idx ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON admin_actions(created_at DESC);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Nadie puede leer ni escribir directo; solo service role (que bypasea RLS).
-- Documentado intencionalmente: cualquier acceso desde cliente requiere API route.
