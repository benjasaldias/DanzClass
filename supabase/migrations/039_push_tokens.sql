-- 039_push_tokens.sql
-- Almacena tokens de push notification de Expo por usuario/dispositivo.
-- Un usuario puede tener múltiples dispositivos activos.

CREATE TABLE push_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,                        -- Expo push token
  platform    TEXT        CHECK (platform IN ('ios', 'android', 'web')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- El propio usuario puede leer, insertar y eliminar sus tokens
CREATE POLICY "push_tokens_select_own" ON push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_tokens_insert_own" ON push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_tokens_delete_own" ON push_tokens FOR DELETE USING (auth.uid() = user_id);
-- El service role puede leer todos los tokens (para enviar notificaciones)
-- (RLS no se aplica a service role, así que esto ya funciona por defecto)
