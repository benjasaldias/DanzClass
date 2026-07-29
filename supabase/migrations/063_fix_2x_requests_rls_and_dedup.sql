-- ============================================================
-- 063_fix_2x_requests_rls_and_dedup.sql
-- ------------------------------------------------------------
-- Cierra dos deudas de `class_2x_requests` anotadas y pospuestas en el
-- registro de sesiones de `marketplace-payments-v2-plan.md` §8 (Sesión 2):
--
-- (1) FUGA DE LECTURA. `013_2x_requests.sql` redeclara la tabla con
--   `CREATE TABLE IF NOT EXISTS`, que Postgres salta porque ya existe (mismo
--   patrón de bug que 062) — PERO las sentencias siguientes del archivo
--   (ENABLE RLS, CREATE POLICY) son statements independientes y sí corren.
--   Eso deja DOS juegos de policies activos sobre la misma tabla:
--     - `002_subscriptions_friends_2x.sql` → "2x_select": solo el dueño o un
--       amigo aceptado, y solo si status='looking'.
--     - `013_2x_requests.sql` → "Auth users can view 2x requests": CUALQUIER
--       usuario autenticado, sin condición.
--   Las policies RLS se evalúan con OR: manda la más permisiva. Resultado:
--   cualquier usuario logueado puede leer TODAS las solicitudes 2x de
--   cualquier clase (looking/matched/cancelled, con quién matcheó y quién
--   tiene el turno de pago), no solo las propias o las de sus amigos.
--   Fix: eliminar la policy permisiva de 013. Las de INSERT/UPDATE/DELETE de
--   013 son funcionalmente idénticas a las de 002 (mismo USING/WITH CHECK) —
--   se eliminan también por prolijidad, sin cambiar ningún comportamiento.
--
-- (2) DUPLICADOS. `002` declara `UNIQUE(user_id, class_id, session_id)`, pero
--   en el modelo 2x actual `session_id` es SIEMPRE NULL, y Postgres trata cada
--   NULL como distinto de cualquier otro NULL → la constraint no restringe
--   nada. Un usuario puede tener N filas 'looking'/'matched' activas para la
--   misma clase (mismo agujero que 056 cerró para `enrollments`). El intento
--   de 013 de declarar `UNIQUE(user_id, class_id)` se perdió por el mismo
--   `CREATE TABLE IF NOT EXISTS` salteado que dejó fuera `payment_assignee`
--   (062). Fix: dedup defensivo de filas activas duplicadas (conserva la
--   'matched' o, si no hay, la más reciente) + índice único parcial sobre
--   filas no-canceladas.
--
-- Aditiva e idempotente salvo por el dedup defensivo (solo toca filas si ya
-- hay duplicados activos preexistentes; en datos limpios es no-op).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS class_2x_requests_unique_active;
--   CREATE POLICY "Auth users can view 2x requests" ON class_2x_requests
--     FOR SELECT USING (auth.uid() IS NOT NULL);
--   -- (las policies de INSERT/UPDATE/DELETE de 013 no se restauran: 002 ya
--   -- cubre el mismo comportamiento, restaurarlas sería un no-op funcional)
-- ============================================================

-- (1) Fuga de lectura: eliminar la policy permisiva y sus duplicados inertes.
DROP POLICY IF EXISTS "Auth users can view 2x requests" ON class_2x_requests;
DROP POLICY IF EXISTS "Users can create own 2x requests" ON class_2x_requests;
DROP POLICY IF EXISTS "Users involved can update 2x requests" ON class_2x_requests;
DROP POLICY IF EXISTS "Users can delete own 2x requests" ON class_2x_requests;

-- (2a) Dedup defensivo: para cada (user_id, class_id) con más de una fila
-- activa (no cancelada), conservar la 'matched' más reciente (o, si no hay
-- ninguna matched, la 'looking' más reciente) y cancelar el resto.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY user_id, class_id
      ORDER BY
        CASE status WHEN 'matched' THEN 0 WHEN 'looking' THEN 1 ELSE 2 END,
        created_at DESC
    ) AS rn
  FROM class_2x_requests
  WHERE status <> 'cancelled'
)
UPDATE class_2x_requests r
SET status = 'cancelled'
FROM ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

-- (2b) Índice único parcial: un usuario no puede tener dos solicitudes 2x
-- activas para la misma clase. `session_id` no se incluye a propósito (el
-- modelo 2x actual no lo usa, ver 002/013).
CREATE UNIQUE INDEX IF NOT EXISTS class_2x_requests_unique_active
  ON class_2x_requests (user_id, class_id)
  WHERE status <> 'cancelled';
