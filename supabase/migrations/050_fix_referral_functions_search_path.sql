-- ============================================================
-- Migration 050: fix missing search_path on referral trigger functions
-- ============================================================
--
-- Bug: `generate_referral_code()` y `handle_new_user()` (035_referral_program.sql)
-- son SECURITY DEFINER pero no fijan `search_path`. Una función SECURITY DEFINER
-- sin `SET search_path` explícito hereda el search_path de la SESIÓN QUE LLAMA,
-- no el de su dueño. El trigger `on_auth_user_created` en auth.users corre bajo
-- el rol `supabase_auth_admin`, cuyo search_path está fijado a `auth` únicamente
-- (sin `public`) — así que las referencias sin calificar a `generate_referral_code()`
-- y a la tabla `profiles` dentro de `handle_new_user()` no resuelven, y todo
-- signup falla con "Database error saving new user" (500 en /auth/v1/signup).
--
-- Nunca se notó en producción porque ahí nadie reprodujo el registro de un
-- trigger nuevo contra una sesión con ese search_path — probablemente el rol
-- `supabase_auth_admin` de producción tiene una config heredada distinta del
-- bootstrap actual de la CLI. Local (`supabase start`/`db reset`) sí lo expone
-- siempre, en cualquier signup.
--
-- Fix: fijar `search_path = public` explícitamente en ambas funciones (patrón
-- ya usado correctamente en 002_subscriptions_friends_2x.sql para sus propias
-- funciones SECURITY DEFINER). ALTER FUNCTION no reescribe el body, solo agrega
-- el search_path — idempotente y sin efecto negativo si ya funcionaba en prod.
--
-- Rollback:
-- ALTER FUNCTION public.generate_referral_code() RESET search_path;
-- ALTER FUNCTION public.handle_new_user() RESET search_path;

ALTER FUNCTION public.generate_referral_code() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
