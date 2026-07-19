-- ============================================================
-- Migration 051: fix stale role default in handle_new_user()
-- ============================================================
--
-- Bug: `handle_new_user()` (redefinida en 035_referral_program.sql) inserta
-- `COALESCE(NEW.raw_user_meta_data->>'role', 'student')` en profiles.role.
-- Pero desde 002_subscriptions_friends_2x.sql la constraint `profiles_role_check`
-- solo permite `role = 'user'` (el rol real de enseñanza pasó a resolverse via
-- `subscriptions.tier` + `canTeach()`, no via esta columna). El formulario de
-- registro real (web `auth/register/page.tsx`, mobile `(auth)/register.tsx`)
-- nunca manda `role` en `raw_user_meta_data`, así que el COALESCE siempre cae
-- a 'student' — violando la constraint en TODO signup real, con
-- "Database error saving new user" (500 en /auth/v1/signup).
--
-- Nunca se notó en producción porque el trigger que corre ahí evidentemente
-- ya no tiene este default viejo (fue corregido directamente vía SQL editor
-- en algún momento sin volver a capturarlo en un archivo de migración — mismo
-- patrón que el bug de 006_notification_types.sql). Replayear el historial
-- completo desde cero (local dev) es lo que expone la versión desactualizada.
--
-- Fix: hardcodear 'user' (coincide con la constraint vigente; 'role' es
-- vestigial desde 002, así que ya no depende de metadata de signup).
--
-- Rollback: no aplica — restaurar el COALESCE con 'student' reintroduciría
-- el bug (todo signup real volvería a fallar).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referred_by UUID;
  v_ref_code TEXT;
BEGIN
  LOOP
    v_ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_ref_code);
  END LOOP;

  IF NEW.raw_user_meta_data->>'ref_code' IS NOT NULL THEN
    SELECT id INTO v_referred_by
    FROM profiles
    WHERE referral_code = NEW.raw_user_meta_data->>'ref_code'
    LIMIT 1;
  END IF;

  INSERT INTO profiles (id, username, full_name, role, referral_code, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    v_ref_code,
    v_referred_by
  );
  RETURN NEW;
END;
$$;
