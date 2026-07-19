-- ============================================================
-- Migration 049: base table privileges for anon/authenticated/service_role
-- ============================================================
--
-- Contexto: en Supabase Cloud, cada proyecto nuevo recibe (via bootstrap
-- del dashboard, fuera de cualquier migración SQL) privilegios base
-- SELECT/INSERT/UPDATE/DELETE sobre las tablas del schema public para los
-- roles anon/authenticated/service_role. RLS es el filtro real de acceso;
-- el GRANT solo habilita que la policy se evalúe en absoluto.
--
-- Un stack de Supabase local levantado desde cero con la CLI
-- (`supabase start` / `supabase db reset`) NO reproduce ese bootstrap:
-- las tablas quedan con privilegios por defecto mínimos para esos roles
-- (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, sin SELECT/INSERT/UPDATE/DELETE),
-- así que toda query desde la app falla con "permission denied" aunque
-- las policies de RLS estén correctas. Esta migración replica el grant
-- base que Supabase Cloud ya aplica automáticamente en producción.
--
-- Idempotente y sin efecto real en producción: el proyecto de producción
-- ya tiene estos privilegios desde su bootstrap inicial; volver a
-- otorgarlos es un no-op. Necesaria solo para reproducir el entorno
-- desde cero (local dev, disaster recovery, nuevo proyecto).

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

-- Asegura que las tablas/funciones/secuencias creadas por futuras
-- migraciones (ejecutadas como rol `postgres`) hereden los mismos
-- privilegios automáticamente, sin necesidad de repetir este GRANT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Rollback (no recomendado en producción — solo documentado por convención
-- del proyecto; revocar esto en un proyecto que dependía de estos grants
-- rompe la app):
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
-- REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
-- REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
