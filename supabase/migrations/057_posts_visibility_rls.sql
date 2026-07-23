-- ============================================================
-- 057_posts_visibility_rls.sql
-- ------------------------------------------------------------
-- (P0-3) Los posts "seguidores"/"amigos" eran invisibles para su audiencia.
--
-- La migración 009 introdujo posts.visibility ('public'|'followers'|'friends')
-- pero NUNCA reescribió la RLS de lectura, que quedó como en 008:
--     posts_select USING (is_public = true OR auth.uid() = user_id)
-- Como CreatePostModal guarda is_public = (visibility === 'public'), un post con
-- visibility 'followers' o 'friends' queda con is_public=false → la RLS solo lo
-- deja ver a su autor. Resultado: el selector "Seguidores / Amigos" no tenía
-- efecto; esos posts desaparecían para todos menos el autor (feature muerta,
-- tanto en el feed "Siguiendo" como en el perfil público).
--
-- Fix: la policy pasa a gobernarse por `visibility` con subconsultas a follows y
-- friendships (ambas con RLS que deja al usuario ver sus propias relaciones):
--   - public   → cualquiera (incl. visitante anónimo del feed público).
--   - followers→ el autor + quienes lo siguen.
--   - friends  → el autor + sus amigos aceptados (relación bidireccional).
-- is_public queda como columna legacy (ya no gobierna la lectura). Para posts
-- públicos el comportamiento es idéntico (visibility='public' ⟺ is_public=true).
--
-- Aditiva (solo recrea una policy). No borra datos.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS posts_select ON posts;
--   CREATE POLICY posts_select ON posts FOR SELECT
--     USING (is_public = true OR auth.uid() = user_id);
-- ============================================================

DROP POLICY IF EXISTS posts_select ON posts;

CREATE POLICY posts_select ON posts FOR SELECT USING (
  auth.uid() = user_id
  OR visibility = 'public'
  OR (
    visibility = 'followers'
    AND EXISTS (
      SELECT 1 FROM follows f
      WHERE f.following_id = posts.user_id
        AND f.follower_id = auth.uid()
    )
  )
  OR (
    visibility = 'friends'
    AND EXISTS (
      SELECT 1 FROM friendships fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.requester_id = auth.uid() AND fr.addressee_id = posts.user_id)
          OR (fr.addressee_id = auth.uid() AND fr.requester_id = posts.user_id)
        )
    )
  )
);
