-- ============================================================
-- Migration 078: Pro gratis para todas las cuentas (lanzamiento)
-- ============================================================
--
-- Decisión de producto (2026-09-04): durante el lanzamiento la app se entrega
-- completa y sin costo. Las suscripciones se ocultan de la UI y TODA cuenta —
-- nueva o existente — recibe una suscripción `pro` gratuita. El objetivo es
-- captar usuarios sin fricción; la monetización queda para después.
--
-- IMPORTANTE — la comisión de servicio del marketplace (2%, tope $700) NO se
-- toca: se desacopló del plan en el código (`paysCommission` en
-- packages/shared/src/lib/commission.ts), porque de lo contrario "todos Pro"
-- la habría puesto en $0 para todo el mundo sin que nadie lo pidiera.
--
-- POR QUÉ UNA FILA EN `subscriptions` Y NO UN `get_user_tier()` QUE DEVUELVA
-- 'pro' A SECAS:
--
--   * El tier lo resuelven DOS motores que tienen que decir lo mismo:
--     `get_user_tier()` en SQL (lo consultan los triggers de `060` — cupo de
--     videos — y de `075` — cupo de clases —, que son los que realmente hacen
--     cumplir los topes, porque `classes` y `posts` se insertan directo desde
--     el cliente) y `getActiveTier()` en TypeScript
--     (packages/shared/src/lib/subscriptionTier.ts), que alimenta toda la UI.
--     Parchar sólo el SQL los habría hecho divergir: la base dejaría publicar
--     y la app seguiría mostrando el candado.
--   * Con la fila, ninguno de los dos motores cambia. Todos los gates
--     (`canTeach`, `canPublishClassType`, `postQuotaForTier`,
--     `class_quota_for_tier`, `plan_required_for_posts`) pasan solos.
--   * Revertir es una sola sentencia (ver Rollback), sin tocar funciones que
--     otras migraciones también redefinen.
--
-- Cambios:
--   1. `subscriptions.source` — marca el origen de la fila. NULL = suscripción
--      normal (pagada por Mercado Pago). 'free_launch' = regalo de lanzamiento.
--      Sin esta columna no habría forma de distinguir después qué cuentas hay
--      que convertir a plan pago, ni de revertir sin borrar suscripciones
--      reales.
--   2. `handle_new_user()` — además del perfil, crea la suscripción Pro.
--   3. Backfill de las cuentas ya existentes.
--
-- `mp_subscription_id` / `mp_preapproval_id` quedan en NULL A PROPÓSITO: son
-- los campos que leen `cancelBillableSubscriptions()` (para cancelar el cobro
-- en Mercado Pago al borrar la cuenta) y `rewardReferralIfNeeded()` (que sólo
-- paga el premio de referido contra una suscripción REAL). Poner un marcador
-- ahí habría hecho que el borrado de cuenta intentara cancelar una
-- preaprobación inexistente en MP, y que el premio de referido se pagara
-- contra un regalo. Por eso el marcador va en una columna nueva.
--
-- Aditiva e idempotente. No borra ni modifica ninguna suscripción existente.
--
-- ============================================================
-- Rollback (fin del lanzamiento gratuito):
--
--   -- 1. Dejar de regalar Pro a las cuentas nuevas: restaurar el cuerpo de
--   --    `handle_new_user()` tal como quedó en 051 (sin el INSERT en
--   --    `subscriptions`).
--   -- 2. Cortar el regalo de las cuentas que ya lo tienen:
--   UPDATE subscriptions SET status = 'expired', expires_at = NOW()
--   WHERE source = 'free_launch' AND status IN ('active', 'grace');
--   -- (No borrar las filas: son el registro de a quién se le regaló el plan.)
--
-- Para dar un plazo en vez de cortar en seco — recomendado si ya hay usuarios:
--   UPDATE subscriptions SET expires_at = NOW() + INTERVAL '30 days'
--   WHERE source = 'free_launch' AND status = 'active';
--   -- `get_user_tier()` y `getActiveTier()` suman 7 días de gracia sobre eso.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Marca de origen
-- ------------------------------------------------------------
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN subscriptions.source IS
  'Origen de la suscripción. NULL = pagada vía Mercado Pago. ''free_launch'' = regalo de lanzamiento (migración 078).';

CREATE INDEX IF NOT EXISTS subscriptions_source_idx
  ON subscriptions (source) WHERE source IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Toda cuenta nueva nace Pro
-- ------------------------------------------------------------
-- Base: la versión VIGENTE de la función, que es la de 051
-- (051_fix_handle_new_user_role_default.sql), NO la de 035 que la introdujo.
-- Partir de una versión vieja al hacer CREATE OR REPLACE sobre una función
-- compartida revierte fixes anteriores sin ningún error — pasó al escribir 074.
--
-- `SET search_path = public` es obligatorio: el trigger lo dispara
-- `supabase_auth_admin`, cuyo search_path es sólo `auth`. Sin esto, todo
-- signup falla con "Database error saving new user" (ya rompió el registro
-- dos veces en este repo: ver 050 y 051).
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

  -- Pro gratuito de lanzamiento (078). La fecha lejana no es un "para
  -- siempre" contractual: es lo que evita que el aviso de vencimiento (que la
  -- UI muestra a 7 días) y la gracia del webhook se disparen sobre un regalo.
  -- Para terminar el lanzamiento se acorta `expires_at`, no se borra la fila.
  INSERT INTO subscriptions (user_id, tier, status, expires_at, source)
  VALUES (NEW.id, 'pro', 'active', NOW() + INTERVAL '100 years', 'free_launch');

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3. Backfill: las cuentas que ya existen
-- ------------------------------------------------------------
-- Sólo se salta a quien YA tiene un Pro vigente (nada que regalarle). A quien
-- tiene un plan pagado menor (basic) se le agrega el Pro gratis igual, y los
-- dos motores coinciden en 'pro': `get_user_tier()` ordena por tier y toma el
-- más alto; `getActiveTier()` ordena por `created_at DESC` y toma esta fila,
-- que es la más nueva. Su suscripción pagada queda intacta debajo.
--
-- Se excluyen las cuentas borradas (soft-delete): regalarle un plan a un
-- tombstone no tiene sentido y ensucia cualquier conteo de usuarios activos.
INSERT INTO subscriptions (user_id, tier, status, expires_at, source)
SELECT p.id, 'pro', 'active', NOW() + INTERVAL '100 years', 'free_launch'
FROM profiles p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p.id
      AND s.tier = 'pro'
      AND s.status IN ('active', 'grace')
      AND s.expires_at + INTERVAL '7 days' > NOW()
  );
