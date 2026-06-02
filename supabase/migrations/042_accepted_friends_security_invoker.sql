-- 042_accepted_friends_security_invoker.sql
-- M-7: Recrear la vista `accepted_friends` con security_invoker = true.
--
-- Por defecto, las vistas PostgreSQL se ejecutan con los permisos del creador
-- (security definer), lo que puede exponer filas de `friendships` aunque el
-- llamador no tenga acceso directo a la tabla subyacente. Con security_invoker
-- la vista hereda las RLS policies del usuario que la consulta.
--
-- NOTA: security_invoker está disponible desde PostgreSQL 15, que Supabase
-- utiliza en proyectos creados desde mediados de 2023. Si el proyecto es anterior
-- a esa versión, esta migración fallará silenciosamente sin efecto.

DROP VIEW IF EXISTS accepted_friends;

CREATE VIEW accepted_friends WITH (security_invoker = true) AS
SELECT
  requester_id AS user_id,
  addressee_id AS friend_id
FROM friendships
WHERE status = 'accepted'
UNION ALL
SELECT
  addressee_id AS user_id,
  requester_id AS friend_id
FROM friendships
WHERE status = 'accepted';
