-- ============================================================
-- 071_realtime_publication.sql
-- ------------------------------------------------------------
-- Habilita Supabase Realtime para las dos tablas que la app suscribe con
-- `postgres_changes`:
--
--   * `chat_messages` — ChatClient (web) y chat/[id] (mobile) esperan que un
--     mensaje nuevo llegue por Realtime. Ninguno de los dos hace append
--     optimista, así que sin Realtime el remitente NO VE SU PROPIO MENSAJE
--     hasta salir y volver a entrar al chat: la feature se ve rota entera.
--   * `notifications` — el badge de NotificationBell (web) se incrementa en
--     vivo por el mismo mecanismo.
--
-- Por qué hace falta una migración: una suscripción a `postgres_changes` sólo
-- recibe filas de tablas incluidas en la publicación `supabase_realtime`. En
-- Supabase Cloud eso se activa a mano desde el dashboard (Database →
-- Replication) y quedó documentado como paso manual sólo para `notifications`;
-- `chat_messages` nunca se documentó ni se versionó. En un stack local
-- levantado desde cero la publicación arranca VACÍA, así que el chat en local
-- está roto de fábrica. Versionarlo acá lo hace reproducible en los dos lados.
--
-- Idempotente: sólo agrega la tabla si no está ya en la publicación (agregarla
-- dos veces es un error 42710). No toca datos ni policies — Realtime evalúa las
-- policies de SELECT del suscriptor, que ya existen (059 para chat, 001 para
-- notificaciones): un participante sólo recibe los mensajes de sus chats.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Stack sin Realtime (algún entorno mínimo): no hay nada que habilitar.
    RAISE NOTICE 'publication supabase_realtime no existe; se omite 071';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['chat_messages', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
