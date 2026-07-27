-- ============================================================
-- 060_post_plan_visibility.sql
-- ------------------------------------------------------------
-- Los videos publicados (posts) dependen de un plan pagado. Hasta ahora, si la
-- suscripción caía, los videos seguían públicos para siempre: el beneficio se
-- pagaba una vez y no se perdía nunca. Esta migración ata la exposición de los
-- posts al plan vigente, SIN borrar contenido de inmediato.
--
-- MODELO
--   posts.plan_hidden_at:
--     NULL      → post expuesto; su alcance lo gobierna `visibility`
--                 (public / followers / friends), como hasta hoy.
--     timestamp → post OCULTO por plan: solo lo ve su autor, y ese timestamp
--                 arranca el reloj de retención (purga a los 3 meses, con avisos
--                 previos enviados por el cron).
--
--   Cupo de posts expuestos según el tier vigente (get_user_tier, que ya
--   contempla los 7 días de gracia):
--     none            → 0   (sin plan: todo oculto)
--     basic           → 3   (BASIC_VIDEO_POST_LIMIT en packages/shared)
--     teacher / pro   → ∞
--
--   Reconciliación (reconcile_user_posts), idempotente y respetuosa de la
--   elección del usuario:
--     - sobran expuestos → oculta los MÁS ANTIGUOS hasta calzar con el cupo
--       (bajar de pro a basic deja expuestos los 3 más recientes).
--     - sobran cupos     → reexpone los ocultos MÁS RECIENTES hasta llenarlos
--       (volver a pagar restaura los videos con su `visibility` original).
--   Solo mueve la diferencia: si el usuario sustituyó un video por otro dentro
--   de su cupo, la reconciliación no le deshace la elección.
--
--   Sustitución (expose_post): exponer un video oculto estando en el tope oculta
--   otro (el elegido, o el más antiguo). El sustituido NO se borra: pasa a
--   oculto con su propio reloj de 3 meses. Subir un video nuevo estando en el
--   tope hace lo mismo automáticamente vía trigger.
--
-- El cupo se hace cumplir en la BASE DE DATOS (triggers + RPC), no solo en la
-- UI: `posts` se inserta directo desde el cliente (CreatePostModal), así que un
-- chequeo en React sería puramente cosmético. La columna plan_hidden_at además
-- queda blindada contra escritura directa del cliente (guard trigger), porque
-- posts_update permite al autor actualizar su propia fila.
--
-- Aditiva. No borra datos. La purga a los 3 meses la ejecuta el cron
-- /api/cron/plan-content (necesita borrar también el asset en Cloudinary, que
-- requiere API secret y por eso no puede vivir en SQL).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS posts_plan_reconcile_trigger ON posts;
--   DROP TRIGGER IF EXISTS posts_plan_quota_guard_trigger ON posts;
--   DROP TRIGGER IF EXISTS posts_plan_hidden_guard_trigger ON posts;
--   DROP FUNCTION IF EXISTS posts_plan_reconcile(), posts_plan_quota_guard(),
--        posts_plan_hidden_guard(), expose_post(UUID, UUID),
--        reconcile_all_post_owners(), reconcile_user_posts(UUID),
--        post_quota_for_tier(TEXT);
--   ALTER TABLE posts DROP COLUMN IF EXISTS plan_hidden_at;
--   -- restaurar posts_select a la definición de 057_posts_visibility_rls.sql
-- ============================================================

-- (1) Columna + índice -------------------------------------------------------

ALTER TABLE posts ADD COLUMN IF NOT EXISTS plan_hidden_at TIMESTAMPTZ;

COMMENT ON COLUMN posts.plan_hidden_at IS
  'NULL = expuesto (rige visibility). Timestamp = oculto por falta de plan; inicia el reloj de purga de 3 meses.';

-- El cron busca los vencidos por esta columna; los feeds filtran por IS NULL.
CREATE INDEX IF NOT EXISTS posts_plan_hidden_at_idx
  ON posts (plan_hidden_at)
  WHERE plan_hidden_at IS NOT NULL;

-- (2) Cupo por tier ----------------------------------------------------------

CREATE OR REPLACE FUNCTION post_quota_for_tier(p_tier TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'basic'   THEN 3
    WHEN 'teacher' THEN 2147483647
    WHEN 'pro'     THEN 2147483647
    ELSE 0
  END;
$$;

-- (3) Reconciliación ---------------------------------------------------------

CREATE OR REPLACE FUNCTION reconcile_user_posts(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota   INTEGER;
  v_visible INTEGER;
  v_delta   INTEGER;
  v_changed INTEGER := 0;
BEGIN
  -- Permite al guard distinguir una escritura legítima del sistema de un
  -- intento del cliente de auto-exponerse (ver posts_plan_hidden_guard).
  PERFORM set_config('danzclass.plan_reconcile', 'on', true);

  v_quota := post_quota_for_tier(get_user_tier(p_user_id));

  SELECT COUNT(*) INTO v_visible
  FROM posts
  WHERE user_id = p_user_id AND plan_hidden_at IS NULL;

  IF v_visible > v_quota THEN
    v_delta := v_visible - v_quota;
    UPDATE posts SET plan_hidden_at = now()
    WHERE id IN (
      SELECT id FROM posts
      WHERE user_id = p_user_id AND plan_hidden_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT v_delta
    );
    GET DIAGNOSTICS v_changed = ROW_COUNT;

  ELSIF v_visible < v_quota THEN
    v_delta := v_quota - v_visible;
    UPDATE posts SET plan_hidden_at = NULL
    WHERE id IN (
      SELECT id FROM posts
      WHERE user_id = p_user_id AND plan_hidden_at IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT v_delta
    );
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  END IF;

  PERFORM set_config('danzclass.plan_reconcile', 'off', true);
  RETURN v_changed;
END;
$$;

-- Barrido diario del cron: reconcilia a todo autor con posts. El costo es
-- proporcional a los usuarios que publicaron alguna vez, no a los posts.
CREATE OR REPLACE FUNCTION reconcile_all_post_owners()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         RECORD;
  v_changed INTEGER := 0;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM posts LOOP
    v_changed := v_changed + reconcile_user_posts(r.user_id);
  END LOOP;
  RETURN v_changed;
END;
$$;

-- (4) Sustitución: exponer un video oculto ----------------------------------
-- p_demote_id: cuál de los expuestos ceder el cupo. NULL = el más antiguo.

CREATE OR REPLACE FUNCTION expose_post(p_post_id UUID, p_demote_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_quota   INTEGER;
  v_visible INTEGER;
  v_needed  INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM posts
  WHERE id = p_post_id AND user_id = v_user AND plan_hidden_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_hidden_or_not_owned' USING ERRCODE = '42501';
  END IF;

  v_quota := post_quota_for_tier(get_user_tier(v_user));
  IF v_quota = 0 THEN
    RAISE EXCEPTION 'plan_required' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('danzclass.plan_reconcile', 'on', true);

  SELECT COUNT(*) INTO v_visible
  FROM posts WHERE user_id = v_user AND plan_hidden_at IS NULL;

  IF v_visible >= v_quota THEN
    v_needed := v_visible - v_quota + 1;

    IF p_demote_id IS NOT NULL THEN
      UPDATE posts SET plan_hidden_at = now()
      WHERE id = p_demote_id AND user_id = v_user AND plan_hidden_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'demoted_post_invalid' USING ERRCODE = '42501';
      END IF;
      v_needed := v_needed - 1;
    END IF;

    IF v_needed > 0 THEN
      UPDATE posts SET plan_hidden_at = now()
      WHERE id IN (
        SELECT id FROM posts
        WHERE user_id = v_user AND plan_hidden_at IS NULL
        ORDER BY created_at ASC, id ASC
        LIMIT v_needed
      );
    END IF;
  END IF;

  UPDATE posts SET plan_hidden_at = NULL WHERE id = p_post_id;

  PERFORM set_config('danzclass.plan_reconcile', 'off', true);
END;
$$;

-- (5) Triggers ---------------------------------------------------------------

-- 5a. Sin plan no se publica (defensa en profundidad: el insert viene del
--     cliente, la UI ya lo bloquea).
CREATE OR REPLACE FUNCTION posts_plan_quota_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF post_quota_for_tier(get_user_tier(NEW.user_id)) = 0 THEN
    RAISE EXCEPTION 'plan_required_for_posts'
      USING ERRCODE = '42501',
            HINT = 'Publicar videos requiere un plan activo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_plan_quota_guard_trigger ON posts;
CREATE TRIGGER posts_plan_quota_guard_trigger
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_plan_quota_guard();

-- 5b. plan_hidden_at es de escritura exclusiva del sistema. posts_update deja
--     al autor actualizar su fila, así que sin esto un usuario Básico podría
--     exponer todos sus videos con un UPDATE directo. Se revierte en silencio
--     (no rompe los updates legítimos, que no tocan esta columna).
CREATE OR REPLACE FUNCTION posts_plan_hidden_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.plan_hidden_at IS DISTINCT FROM OLD.plan_hidden_at
     AND COALESCE(current_setting('danzclass.plan_reconcile', true), 'off') <> 'on'
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    NEW.plan_hidden_at := OLD.plan_hidden_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_plan_hidden_guard_trigger ON posts;
CREATE TRIGGER posts_plan_hidden_guard_trigger
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_plan_hidden_guard();

-- 5c. Al publicar o borrar, recalcular el cupo del autor. Publicar estando en
--     el tope oculta el más antiguo (= "subir uno nuevo que lo sustituya");
--     borrar un expuesto libera el cupo y reexpone el oculto más reciente.
--     Solo INSERT/DELETE: los UPDATE internos de la reconciliación no reentran.
CREATE OR REPLACE FUNCTION posts_plan_reconcile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM reconcile_user_posts(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS posts_plan_reconcile_trigger ON posts;
CREATE TRIGGER posts_plan_reconcile_trigger
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_plan_reconcile();

-- (6) RLS de lectura ---------------------------------------------------------
-- Igual que 057 (visibility gobierna el alcance) más: un post oculto por plan
-- solo lo ve su autor.

DROP POLICY IF EXISTS posts_select ON posts;

CREATE POLICY posts_select ON posts FOR SELECT USING (
  auth.uid() = posts.user_id
  OR (
    posts.plan_hidden_at IS NULL
    AND (
      posts.visibility = 'public'
      OR (
        posts.visibility = 'followers'
        AND EXISTS (
          SELECT 1 FROM follows f
          WHERE f.following_id = posts.user_id
            AND f.follower_id = auth.uid()
        )
      )
      OR (
        posts.visibility = 'friends'
        AND EXISTS (
          SELECT 1 FROM friendships fr
          WHERE fr.status = 'accepted'
            AND (
              (fr.requester_id = auth.uid() AND fr.addressee_id = posts.user_id)
              OR (fr.addressee_id = auth.uid() AND fr.requester_id = posts.user_id)
            )
        )
      )
    )
  )
);

-- (7) Notificación de purga próxima -----------------------------------------
-- Reescribe el constraint completo (cada migración que agrega un tipo debe
-- repetir todos los anteriores). Base: 038_events.sql.

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
  'posts_expiring'
));

-- (8) Grants -----------------------------------------------------------------
-- expose_post la llama el usuario (valida propiedad con auth.uid()); el resto
-- es maquinaria del sistema.

REVOKE ALL ON FUNCTION reconcile_user_posts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION reconcile_all_post_owners() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_user_posts(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_all_post_owners() TO service_role;
GRANT EXECUTE ON FUNCTION post_quota_for_tier(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION expose_post(UUID, UUID) TO authenticated, service_role;

-- (9) Backfill ---------------------------------------------------------------
-- Deja el estado consistente para los posts que ya existen.

SELECT reconcile_all_post_owners();
