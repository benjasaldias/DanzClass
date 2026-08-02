-- ============================================================
-- 075_class_plan_quota.sql   (audit3.md P1-1)
-- ------------------------------------------------------------
-- El plan Básico ($1.500/mes) promete "1 clase suelta por mes" y el Pro ($3.500)
-- "clases ilimitadas (sueltas y periódicas)". Esa diferencia —el único motivo
-- para pagar Pro— no se hacía cumplir en ninguna capa que el usuario no
-- controle:
--
--   · Web    → el formulario cuenta las sueltas del mes y bloquea el botón, pero
--              el INSERT en `classes` sale DIRECTO del cliente: otra pestaña,
--              otro dispositivo o un POST a PostgREST se lo saltan.
--   · Mobile → no existe el gate. La pantalla de publicar ofrece "Periódica" y
--              "Entrenamiento" a cualquiera con `canTeach(tier)`, y el
--              formulario sólo usa el tier para el número de archivos.
--   · Base   → `classes_insert_teacher` (017) sólo exige tener ALGÚN plan.
--
--   Reproducido con un JWT de tier 'basic' (audit3 §P1-1): 3 sueltas + 1
--   periódica + 1 entrenamiento aceptadas.
--
-- MISMO PATRÓN QUE `060` (cupo de videos), y por la misma razón: la fila la
-- inserta el cliente, así que el tope tiene que vivir en la base. La UI queda
-- como cortesía (mostrar el candado antes de llenar el formulario), no como
-- control.
--
-- REGLAS
--   class_quota_for_tier(tier) → sueltas publicables por MES CALENDARIO:
--     none            → 0   (ya lo cubría la policy de 017; el trigger lo repite
--                            por si alguna vez se relaja)
--     basic           → 1
--     teacher / pro   → ∞
--   type IN ('periodica','entrenamiento') exige cupo ilimitado (= Pro), tanto al
--   publicar como al EDITAR: `classes_update_teacher` (001) es
--   `FOR UPDATE ... USING` sin `WITH CHECK` —el defecto que `065` y `073`
--   cerraron en otras 11 tablas—, así que sin la rama de UPDATE bastaba con
--   publicar una suelta y convertirla en periódica.
--
-- DOS DECISIONES QUE CONVIENE LEER ANTES DE "CORREGIRLAS":
--
--   1. El cupo cuenta las clases CREADAS en el mes, en cualquier estado,
--      incluidas las canceladas después. Si cancelar liberara el cupo, el tope
--      no existiría: publicar → cancelar → publicar, sin fin. Es además lo que
--      ya contaba el formulario web, así que UI y base dicen lo mismo.
--
--   2. NO se toca nada de lo ya publicado. Un profesor Básico que hoy tiene 8
--      sueltas y 2 periódicas las conserva enteras, con sus alumnos inscritos y
--      pagados; el tope rige desde la próxima publicación. Misma decisión que
--      `067` tomó al no truncar las periódicas heredadas.
--
--   El mes se calcula en UTC (`date_trunc('month', now())`), igual que el
--   contador del formulario web (`new Date(y, m, 1)` en un runtime UTC). Chile
--   está detrás de UTC, así que el mes nuevo abre unas horas ANTES para el
--   profesor: permisivo, nunca restrictivo, y sin desfase entre UI y base.
--
-- El guard NO aplica a service_role/postgres (`danzclass_is_privileged()`, de
-- `065`): ninguna ruta de servidor inserta clases —verificado por grep: los dos
-- únicos INSERT salen de los formularios— y el service role ya se salta la
-- policy de 017 por definición. Mantenerlo exento deja funcionar seeds,
-- backfills y soporte sin abrir nada nuevo.
--
-- ⚠️ El guard es SECURITY INVOKER a propósito, igual que los seis de `065`:
-- dentro de una función SECURITY DEFINER, `current_user` es el DUEÑO de la
-- función (postgres), así que `danzclass_is_privileged()` devolvería `true`
-- para todo el mundo y el guard no bloquearía nada. Se reprodujo escribiendo
-- esta migración: la primera versión, SECURITY DEFINER, dejó pasar la segunda
-- suelta del mes sin una sola queja. La pregunta de datos ("¿cuántas lleva este
-- mes?") va aparte, en un helper que SÍ es DEFINER, para que la respuesta no
-- dependa de lo que el llamador pueda leer bajo RLS.
--
-- Depende de `065` (helper `danzclass_is_privileged`) y de `002` (`get_user_tier`).
--
-- Aditiva e idempotente. No borra ni modifica datos.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS classes_write_guard_trigger ON classes;
--   DROP FUNCTION IF EXISTS classes_write_guard();
--   DROP FUNCTION IF EXISTS monthly_suelta_count(UUID);
--   DROP FUNCTION IF EXISTS class_quota_for_tier(TEXT);
-- ============================================================

-- (1) Cupo por tier — espejo de packages/shared/src/lib/classQuota.ts ---------

CREATE OR REPLACE FUNCTION class_quota_for_tier(p_tier TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'basic'   THEN 1
    WHEN 'teacher' THEN 2147483647
    WHEN 'pro'     THEN 2147483647
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION class_quota_for_tier(TEXT) IS
  'Clases sueltas publicables por mes calendario según el plan. 0 = no puede publicar.';

-- (2) Cuántas sueltas lleva el profesor este mes -----------------------------
-- SECURITY DEFINER (patrón de `is_class_teacher` en 065): la cuenta no puede
-- depender de qué filas alcance a ver el llamador bajo RLS.

CREATE OR REPLACE FUNCTION monthly_suelta_count(p_teacher_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::INTEGER
  FROM classes c
  WHERE c.teacher_id = p_teacher_id
    AND c.type = 'suelta'
    AND c.created_at >= date_trunc('month', now());
$$;

GRANT EXECUTE ON FUNCTION class_quota_for_tier(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION monthly_suelta_count(UUID) TO authenticated, anon, service_role;

-- (3) Guard de publicación y edición -----------------------------------------

CREATE OR REPLACE FUNCTION classes_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quota INTEGER;
  v_count INTEGER;
BEGIN
  -- Seeds, backfills y soporte pasan derecho (ver el header).
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- La clase no cambia de dueño. Sin esto, y como la policy de UPDATE no
    -- tiene WITH CHECK, un profesor podía reasignar su clase —con sus
    -- inscripciones, sus pagos y su historial— a otra cuenta. Se revierte en
    -- silencio para no romper los updates legítimos, que no tocan la columna.
    IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
      NEW.teacher_id := OLD.teacher_id;
    END IF;

    -- Convertir una suelta ya publicada en periódica es la puerta trasera del
    -- gate de abajo. El camino inverso (a 'suelta') no se restringe: la clase
    -- ya existe y bajarla de tipo no gana ningún cupo.
    IF NEW.type IS DISTINCT FROM OLD.type
       AND NEW.type IN ('periodica', 'entrenamiento')
       AND class_quota_for_tier(get_user_tier(NEW.teacher_id)) < 2147483647
    THEN
      RAISE EXCEPTION 'class_type_requires_pro'
        USING ERRCODE = '42501',
              HINT = 'Las clases periódicas y los entrenamientos son del plan Pro.';
    END IF;

    RETURN NEW;
  END IF;

  v_quota := class_quota_for_tier(get_user_tier(NEW.teacher_id));

  IF v_quota = 0 THEN
    RAISE EXCEPTION 'plan_required_for_classes'
      USING ERRCODE = '42501',
            HINT = 'Publicar clases requiere un plan activo.';
  END IF;

  -- Periódicas y entrenamientos son del plan Pro.
  IF NEW.type IN ('periodica', 'entrenamiento') AND v_quota < 2147483647 THEN
    RAISE EXCEPTION 'class_type_requires_pro'
      USING ERRCODE = '42501',
            HINT = 'Las clases periódicas y los entrenamientos son del plan Pro.';
  END IF;

  -- Tope mensual de sueltas. Cuenta lo CREADO en el mes, en cualquier estado.
  IF NEW.type = 'suelta' AND v_quota < 2147483647 THEN
    v_count := monthly_suelta_count(NEW.teacher_id);

    IF v_count >= v_quota THEN
      RAISE EXCEPTION 'class_quota_exceeded'
        USING ERRCODE = '42501',
              HINT = 'El plan Básico permite 1 clase suelta por mes.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_write_guard_trigger ON classes;
CREATE TRIGGER classes_write_guard_trigger
  BEFORE INSERT OR UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION classes_write_guard();
