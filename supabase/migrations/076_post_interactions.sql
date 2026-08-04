-- ============================================================
-- 076_post_interactions.sql
-- ------------------------------------------------------------
-- Interacciones sobre publicaciones de VIDEO: "me gusta" (corazón) y
-- "¡Enséñala!" (pedirle al autor que enseñe la coreografía del video).
--
-- Hasta acá un video no tenía ninguna interacción: se veía y nada más. Las dos
-- que agrega esta migración cumplen funciones distintas y por eso NO comparten
-- tabla:
--
--   · post_likes          → señal social, gratis y reversible, sin aviso al
--                           autor. Lo escribe el cliente directo (RLS), igual
--                           que `follows`.
--   · post_teach_requests → demanda comercial: "quiero que dictes esto". Le
--                           llega al autor como notificación y es el insumo de
--                           "ya hay 12 personas esperando esta clase". Lo
--                           escribe SÓLO /api/post/teach-request con service
--                           role, porque hay reglas que la RLS no puede
--                           expresar (que el autor lo haya habilitado, que no
--                           sea el propio autor, y el aviso deduplicado).
--
-- posts.allow_teach_requests nace en FALSE a propósito: muchos videos son
-- coreografías ajenas (covers), y a esas su autor no las puede ni quiere
-- enseñar. El botón se habilita al publicar, decisión del autor.
--
-- CONTADORES DENORMALIZADOS (likes_count / teach_requests_count): el feed pinta
-- hasta 20 videos por página en 8 pantallas distintas; contar por fila sería un
-- N+1 en el camino más caliente de la app. Los mantiene un trigger que RECUENTA
-- (no incrementa): bajo concurrencia el recuento no puede derivar, y a esta
-- escala cuesta lo mismo.
--
-- ⚠️ Y por eso hace falta un guard: `posts_update` (008) es
-- `FOR UPDATE USING (auth.uid() = user_id)` **sin `WITH CHECK`** —el mismo
-- defecto que `065`/`073`/`075` cerraron en 12 tablas—, así que sin él el autor
-- de un video podía inflarse el contador de likes con un PATCH a PostgREST, o
-- regalarle su video a otra cuenta cambiando `user_id`. El guard es SECURITY
-- INVOKER a propósito (ver `075`): dentro de una función SECURITY DEFINER
-- `current_user` es el dueño (postgres) y `danzclass_is_privileged()` diría
-- `true` para todo el mundo, en silencio.
--
-- Depende de `065` (`danzclass_is_privileged`) y de `060` (posts.plan_hidden_at,
-- cuya policy de lectura se reutiliza tal cual: un video oculto por plan no
-- acepta interacciones porque nadie más que su autor lo ve).
--
-- Aditiva e idempotente. No borra ni modifica datos.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS posts_counters_guard_trigger ON posts;
--   DROP FUNCTION IF EXISTS posts_counters_guard();
--   DROP TRIGGER IF EXISTS post_likes_count_sync_trigger ON post_likes;
--   DROP TRIGGER IF EXISTS post_teach_requests_count_sync_trigger ON post_teach_requests;
--   DROP FUNCTION IF EXISTS post_likes_count_sync();
--   DROP FUNCTION IF EXISTS post_teach_requests_count_sync();
--   DROP TABLE IF EXISTS post_likes;
--   DROP TABLE IF EXISTS post_teach_requests;
--   ALTER TABLE posts DROP COLUMN IF EXISTS likes_count;
--   ALTER TABLE posts DROP COLUMN IF EXISTS teach_requests_count;
--   ALTER TABLE posts DROP COLUMN IF EXISTS allow_teach_requests;
--   -- y recrear notifications_type_check sin 'teach_request' (lista de 070).
-- ============================================================

-- (1) Columnas nuevas en posts -----------------------------------------------

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS teach_requests_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS allow_teach_requests BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN posts.likes_count IS
  'Denormalizado. Lo mantiene post_likes_count_sync(); el cliente no lo escribe (posts_counters_guard).';
COMMENT ON COLUMN posts.teach_requests_count IS
  'Denormalizado. Lo mantiene post_teach_requests_count_sync(); el cliente no lo escribe.';
COMMENT ON COLUMN posts.allow_teach_requests IS
  'El autor habilita el botón "¡Enséñala!" al publicar. FALSE por defecto: un cover no es coreografía propia.';

-- (2) Tablas de interacción ---------------------------------------------------

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    UUID        NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_teach_requests (
  post_id    UUID        NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- La PK ya cubre las búsquedas por post. Estos índices son para la consulta
-- inversa, que es la que hace cada pantalla al cargar: "de estos 20 videos,
-- ¿cuáles marqué yo?".
CREATE INDEX IF NOT EXISTS post_likes_user_id_idx          ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS post_teach_requests_user_id_idx ON post_teach_requests(user_id);

ALTER TABLE post_likes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_teach_requests ENABLE ROW LEVEL SECURITY;

-- (3) RLS ---------------------------------------------------------------------
-- Lectura: las propias marcas siempre, y las de terceros sólo sobre videos que
-- el llamador puede ver. El EXISTS sobre `posts` se evalúa CON la policy de
-- `posts` (060), así que hereda visibility + plan_hidden_at sin repetir la
-- lógica. No hay recursión posible: ninguna policy de `posts` mira estas tablas.

DROP POLICY IF EXISTS post_likes_select ON post_likes;
CREATE POLICY post_likes_select ON post_likes FOR SELECT USING (
  auth.uid() = post_likes.user_id
  OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_likes.post_id)
);

-- El like sí lo escribe el cliente: es reversible, no notifica a nadie y no
-- mueve dinero. El EXISTS impide "likear" un video que no se puede ver.
DROP POLICY IF EXISTS post_likes_insert ON post_likes;
CREATE POLICY post_likes_insert ON post_likes FOR INSERT WITH CHECK (
  auth.uid() = post_likes.user_id
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_likes.post_id)
);

DROP POLICY IF EXISTS post_likes_delete ON post_likes;
CREATE POLICY post_likes_delete ON post_likes FOR DELETE USING (
  auth.uid() = post_likes.user_id
);

DROP POLICY IF EXISTS post_teach_requests_select ON post_teach_requests;
CREATE POLICY post_teach_requests_select ON post_teach_requests FOR SELECT USING (
  auth.uid() = post_teach_requests.user_id
  OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_teach_requests.post_id)
);

-- Sin policies de INSERT/UPDATE/DELETE: escribe sólo /api/post/teach-request
-- (service role). La ruta valida lo que la RLS no alcanza a expresar —que el
-- autor habilitó el botón, que el solicitante no es el autor— y manda el aviso
-- una sola vez. Mismo criterio que `payments` y `ratings` desde `065`.

-- (4) Sincronización de contadores -------------------------------------------
-- SECURITY DEFINER: cuenta filas que el llamador no necesariamente puede leer
-- bajo RLS, y además es lo que hace que el UPDATE sobre `posts` pase el guard
-- de (5) (dentro de una función DEFINER, current_user es el dueño).

CREATE OR REPLACE FUNCTION post_likes_count_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE posts
     SET likes_count = (SELECT count(*) FROM post_likes pl WHERE pl.post_id = v_post_id)
   WHERE posts.id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_likes_count_sync_trigger ON post_likes;
CREATE TRIGGER post_likes_count_sync_trigger
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION post_likes_count_sync();

CREATE OR REPLACE FUNCTION post_teach_requests_count_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE posts
     SET teach_requests_count = (
           SELECT count(*) FROM post_teach_requests ptr WHERE ptr.post_id = v_post_id
         )
   WHERE posts.id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_teach_requests_count_sync_trigger ON post_teach_requests;
CREATE TRIGGER post_teach_requests_count_sync_trigger
  AFTER INSERT OR DELETE ON post_teach_requests
  FOR EACH ROW EXECUTE FUNCTION post_teach_requests_count_sync();

-- (5) Guard de escritura sobre posts -----------------------------------------
-- Trigger NUEVO, no un CREATE OR REPLACE sobre `posts_plan_hidden_guard` (060):
-- reescribir una función compartida partiendo de la migración equivocada ya
-- revirtió un fix en silencio una vez (ver la nota de `074` en CLAUDE.md).
-- Los dos triggers BEFORE UPDATE conviven; cada uno cuida sus columnas.

CREATE OR REPLACE FUNCTION posts_counters_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  -- Los contadores son derivados: se revierten en silencio, para no romper los
  -- updates legítimos del autor (título, visibilidad, allow_teach_requests).
  NEW.likes_count          := OLD.likes_count;
  NEW.teach_requests_count := OLD.teach_requests_count;

  -- Cambiar de dueño sí es un ataque, no un descuido: se rechaza.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'post_owner_immutable'
      USING ERRCODE = '42501',
            HINT = 'Un video no cambia de autor.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_counters_guard_trigger ON posts;
CREATE TRIGGER posts_counters_guard_trigger
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_counters_guard();

-- (6) Tipo de notificación ----------------------------------------------------
-- Cada migración reescribe el CHECK completo. Base: la lista de `070`.

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
  'mp_connection_expiring', 'payment_refunded',
  'teach_request'
));
