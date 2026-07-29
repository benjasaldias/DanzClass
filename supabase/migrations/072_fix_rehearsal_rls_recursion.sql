-- ============================================================
-- 072_fix_rehearsal_rls_recursion.sql
-- ------------------------------------------------------------
-- RECURSIÓN INFINITA (42P17) en `rehearsals` y `rehearsal_invites`.
--
-- Exactamente el mismo defecto que 059 corrigió en el chat, en otra feature:
--
--   * `rehearsals_invitees_select` (023) hace EXISTS sobre `rehearsal_invites`.
--   * `rehearsal_invites_creator`  (023) hace EXISTS sobre `rehearsals`.
--
-- Las subconsultas de una policy se evalúan CON las policies de la tabla
-- referenciada, así que las dos se llaman entre sí y Postgres aborta con
-- "infinite recursion detected in policy for relation rehearsals". No es un caso
-- de borde: revienta CUALQUIER lectura de esas dos tablas desde un cliente,
-- también la del creador (las policies se combinan con OR, y basta con que una
-- recurse para que la consulta entera falle).
--
-- Verificado contra el stack local con un JWT de usuario real:
--   SELECT * FROM rehearsals WHERE id = <ensayo> → 42P17
--   SELECT * FROM rehearsal_invites WHERE ...    → 42P17
--
-- Qué estaba roto por esto, sin que ninguna pantalla lo dijera:
--   * mobile: el detalle de ensayo consulta ambas tablas directo y hacía
--     `router.back()` al no recibir datos — el ensayo era inabrible;
--   * mobile: la agenda perdía los ensayos (mismo error, descartado en silencio);
--   * web: donde el feed/agenda leen con el cliente de sesión.
--   Las rutas /api/rehearsal/* NO fallaban porque usan service role, que no
--   evalúa RLS — por eso el detalle web (que va por ruta) parecía sano.
--
-- Fix: dos funciones SECURITY DEFINER que resuelven la pertenencia sin pasar por
-- RLS, y policies reescritas para usarlas. Mismo patrón que `is_chat_participant`
-- (059) y `get_user_tier` (002). Las reglas de negocio no cambian: el creador
-- gestiona su ensayo, el invitado lo lee y responde su invitación.
--
-- Idempotente. No borra datos.
--
-- ROLLBACK (restaura el comportamiento roto de 023, no recomendado):
--   DROP POLICY IF EXISTS rehearsals_invitees_select ON rehearsals;
--   DROP POLICY IF EXISTS rehearsal_invites_creator  ON rehearsal_invites;
--   DROP FUNCTION IF EXISTS is_rehearsal_invitee(UUID);
--   DROP FUNCTION IF EXISTS is_rehearsal_creator(UUID);
--   -- y volver a crear las dos policies tal como están en 023_rehearsals.sql
-- ============================================================

CREATE OR REPLACE FUNCTION is_rehearsal_invitee(p_rehearsal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rehearsal_invites ri
    WHERE ri.rehearsal_id = p_rehearsal_id
      AND ri.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_rehearsal_creator(p_rehearsal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rehearsals r
    WHERE r.id = p_rehearsal_id
      AND r.creator_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_rehearsal_invitee(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_rehearsal_creator(UUID) TO authenticated, service_role;

-- rehearsals: el invitado lee (el creador ya está cubierto por
-- `rehearsals_creator_all`, que no subconsulta nada).
DROP POLICY IF EXISTS "rehearsals_invitees_select" ON rehearsals;
CREATE POLICY "rehearsals_invitees_select" ON rehearsals
  FOR SELECT USING (is_rehearsal_invitee(rehearsals.id));

-- rehearsal_invites: el creador gestiona las invitaciones de sus ensayos
-- (`rehearsal_invites_own` cubre al invitado y tampoco subconsulta).
DROP POLICY IF EXISTS "rehearsal_invites_creator" ON rehearsal_invites;
CREATE POLICY "rehearsal_invites_creator" ON rehearsal_invites
  FOR ALL
  USING (is_rehearsal_creator(rehearsal_invites.rehearsal_id))
  WITH CHECK (is_rehearsal_creator(rehearsal_invites.rehearsal_id));
