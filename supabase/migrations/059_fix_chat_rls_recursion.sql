-- ============================================================
-- 059_fix_chat_rls_recursion.sql
-- ------------------------------------------------------------
-- Corrige DOS defectos de las policies de chat creadas en 037_chat.sql.
--
-- (1) RECURSIÓN INFINITA (42P17) — el bug reportado.
--     La policy de SELECT de `chat_participants` se consulta a sí misma:
--         USING (EXISTS (SELECT 1 FROM chat_participants cp2 WHERE ...))
--     Cualquier acceso a chat_participants evalúa la policy, que vuelve a leer
--     chat_participants, que vuelve a evaluar la policy → Postgres aborta con
--     "infinite recursion detected in policy for relation chat_participants".
--     Como las policies de `chats` y `chat_messages` también subconsultan
--     chat_participants, el error se propaga a TODO acceso de cliente al chat:
--     enviar mensaje (INSERT directo desde el cliente), suscripción Realtime,
--     y las lecturas que mobile hace directo a `chats`/`chat_participants`.
--     Las lecturas por API (/api/chat/list, /api/chat/[id]/messages) NO fallaban
--     porque usan service role, que no evalúa RLS — por eso el chat "se veía"
--     pero no dejaba escribir.
--
-- (2) FUGA DE LECTURA (agujero de seguridad) — encontrado al corregir (1).
--     En `chat_messages_select`/`chat_messages_insert` y en la propia policy de
--     chat_participants, la condición se escribió `cp.chat_id = chat_id`. Por las
--     reglas de scoping de SQL, el `chat_id` sin calificar resuelve a la columna
--     de la tabla del subquery (`cp.chat_id`), NO a la de la fila evaluada:
--     la condición degenera en `cp.chat_id = cp.chat_id` (siempre verdadera).
--     Efecto real: cualquier usuario que participe en AL MENOS UN chat podía
--     leer los mensajes de TODOS los chats de la plataforma.
--     (`chats_select_participant` usaba `cp.chat_id = id`, e `id` no existe en
--     chat_participants, así que esa sí resolvía a la fila externa: correcta.)
--
-- Fix: función SECURITY DEFINER `is_chat_participant(uuid)` que resuelve la
-- pertenencia sin pasar por RLS (el dueño de la función salta RLS), + policies
-- reescritas con referencias explícitas a la tabla externa. Mismo patrón que
-- get_user_tier() (002). Las reglas de negocio no cambian: solo participantes
-- leen/escriben en su chat. La creación de chats y de participantes sigue
-- siendo exclusiva del service role (/api/chat/get-or-create), como en 037.
--
-- Idempotente. No borra datos.
--
-- ROLLBACK (restaura el comportamiento roto de 037, no recomendado):
--   DROP POLICY IF EXISTS chat_participants_select ON chat_participants;
--   DROP POLICY IF EXISTS chats_select_participant ON chats;
--   DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
--   DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
--   DROP FUNCTION IF EXISTS is_chat_participant(UUID);
--   -- y volver a crear las policies tal como están en 037_chat.sql
-- ============================================================

CREATE OR REPLACE FUNCTION is_chat_participant(p_chat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_participants cp
    WHERE cp.chat_id = p_chat_id
      AND cp.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_chat_participant(UUID) TO authenticated, service_role;

-- chats: visible solo a sus participantes ------------------------------------
DROP POLICY IF EXISTS "chats_select_participant" ON chats;
CREATE POLICY "chats_select_participant" ON chats
  FOR SELECT USING (is_chat_participant(chats.id));

-- chat_participants: cada quien ve su propia fila y las de sus co-participantes
DROP POLICY IF EXISTS "chat_participants_select" ON chat_participants;
CREATE POLICY "chat_participants_select" ON chat_participants
  FOR SELECT USING (
    chat_participants.user_id = auth.uid()
    OR is_chat_participant(chat_participants.chat_id)
  );

DROP POLICY IF EXISTS "chat_participants_update_own" ON chat_participants;
CREATE POLICY "chat_participants_update_own" ON chat_participants
  FOR UPDATE USING (auth.uid() = chat_participants.user_id);

-- chat_messages: solo participantes del chat leen/envían ----------------------
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (is_chat_participant(chat_messages.chat_id));

DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = chat_messages.sender_id
    AND is_chat_participant(chat_messages.chat_id)
  );
