-- ============================================================
-- 052_teacher_mp_connections.sql
-- ------------------------------------------------------------
-- OAuth Connect de Mercado Pago para profesores (marketplace / split de pagos).
--
-- Modelo (sesión 2026-07-17): un alumno SIN plan paga la clase in-app por
-- Mercado Pago; DanzClass retiene una comisión (2%, tope $700) y el resto se
-- liquida al profesor vía split. Para que el split ocurra en origen, cada
-- profesor conecta SU cuenta de Mercado Pago vía OAuth (Mercado Pago Connect).
-- Los tokens del profesor se guardan aquí; el pago del alumno se crea con el
-- access_token del profesor + marketplace_fee = comisión.
--
-- Seguridad: la tabla guarda tokens sensibles (access_token/refresh_token).
-- RLS ON SIN policies → solo el service role puede leer/escribir (mismo patrón
-- que app_settings en 047 y admin_actions en 027). El cliente NUNCA toca esta
-- tabla; el estado "conectado/no conectado" se expone vía profiles.mp_connected
-- (booleano público, sin secretos), para poder gatear el botón de pago in-app.
--
-- Aditiva. No borra datos existentes.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS teacher_mp_connections;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS mp_connected;
-- ============================================================

-- Flag público de conexión (sin secretos) — legible por las RLS existentes de profiles.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mp_connected BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS teacher_mp_connections (
  teacher_id    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  mp_user_id    TEXT NOT NULL,             -- user_id de la cuenta MP del profesor
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  public_key    TEXT,
  scope         TEXT,
  live_mode     BOOLEAN NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ,               -- now() + expires_in del token exchange
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una misma cuenta MP no puede quedar vinculada a dos profesores distintos.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_mp_connections_mp_user_id_key
  ON teacher_mp_connections (mp_user_id);

-- RLS ON sin policies: solo service role (createAdminClient) accede.
ALTER TABLE teacher_mp_connections ENABLE ROW LEVEL SECURITY;

-- Mantiene updated_at al día (reutiliza el trigger genérico de 001).
DROP TRIGGER IF EXISTS update_teacher_mp_connections_updated_at ON teacher_mp_connections;
CREATE TRIGGER update_teacher_mp_connections_updated_at
  BEFORE UPDATE ON teacher_mp_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
