-- ============================================================
-- 065_write_guards_rls.sql
-- ------------------------------------------------------------
-- Cierre de la superficie de escritura RLS (audit.md P0-1 / P1-5, sesión S1).
--
-- EL PROBLEMA. Las policies `FOR UPDATE ... USING (...)` de 001 (y de 036/038)
-- no llevan `WITH CHECK`. Postgres, en ese caso, reutiliza la expresión `USING`
-- como `WITH CHECK`: valida QUÉ FILAS podés tocar, pero no QUÉ VALORES podés
-- escribir en ellas. Como la fila sigue siendo tuya después del cambio,
-- cualquier columna queda escribible desde un PATCH directo a PostgREST — sin
-- pasar por ninguna ruta de la app, así que ni `requireUser`, ni el rate limit,
-- ni las validaciones de las rutas intervienen.
--
-- Verificado contra este mismo esquema (tests/integration/rls-guards.spec.ts,
-- con JWT de usuario real): los 13 ataques de esa suite pasaban antes de esta
-- migración. Entre ellos: confirmarse la inscripción sin pagar, fabricar un
-- pago `verified` que entra al Panel Financiero y a la conciliación tributaria,
-- anular el hold de cupo de 10 minutos, mudar la inscripción a una clase más
-- cara, rearmar el premio de referido (+30 días Pro repetibles), valorar a un
-- profesor con el que nunca se tomó clase, entrar gratis a un evento pagado y
-- forzarle el turno de pago 2x al compañero.
--
-- POR QUÉ TRIGGERS Y NO `WITH CHECK`. Hay que comparar NEW vs OLD columna a
-- columna ("¿cambió `status`?"), y una expresión de policy solo ve la fila
-- resultante. Mismo patrón ya usado en 060 para blindar `posts.plan_hidden_at`.
--
-- CRITERIO. No se blinda "todo lo que el dueño puede tocar", sino solo las
-- columnas que representan una DECISIÓN AJENA (la del profesor, la del
-- organizador o la del servidor): estados de pago/inscripción, turnos de pago,
-- holds de cupo y flags de identidad. Editar el propio perfil, cancelar la
-- propia búsqueda 2x o subir el comprobante de un evento siguen saliendo del
-- cliente exactamente como hoy — hay una segunda prueba en esa misma suite que
-- lo verifica, porque un guard demasiado estricto rompe pantallas sin avisar.
--
-- El rol privilegiado (service role) queda exento: TODAS las rutas de servidor
-- usan `createAdminClient()`, y son ellas las que aplican las reglas de negocio.
--
-- Aditiva e idempotente. No modifica datos.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS enrollments_write_guard_trigger ON enrollments;
--   DROP TRIGGER IF EXISTS profiles_write_guard_trigger ON profiles;
--   DROP TRIGGER IF EXISTS event_enrollments_write_guard_trigger ON event_enrollments;
--   DROP TRIGGER IF EXISTS event_payments_write_guard_trigger ON event_payments;
--   DROP TRIGGER IF EXISTS package_enrollments_write_guard_trigger ON package_enrollments;
--   DROP TRIGGER IF EXISTS class_2x_requests_write_guard_trigger ON class_2x_requests;
--   DROP FUNCTION IF EXISTS enrollments_write_guard();
--   DROP FUNCTION IF EXISTS profiles_write_guard();
--   DROP FUNCTION IF EXISTS event_enrollments_write_guard();
--   DROP FUNCTION IF EXISTS event_payments_write_guard();
--   DROP FUNCTION IF EXISTS package_enrollments_write_guard();
--   DROP FUNCTION IF EXISTS class_2x_requests_write_guard();
--   DROP FUNCTION IF EXISTS danzclass_is_privileged();
--   DROP FUNCTION IF EXISTS is_class_teacher(UUID);
--   DROP FUNCTION IF EXISTS is_event_creator(UUID);
--   -- y recrear las policies eliminadas más abajo (payments_insert_student,
--   -- payments_update_teacher, ratings_insert_own, ratings_update_own).
-- ============================================================

-- (1) Helpers -----------------------------------------------------------------

-- SECURITY INVOKER a propósito: necesita ver el rol REAL de la sesión.
-- PostgREST hace `SET ROLE` según el JWT (`authenticated` / `anon` /
-- `service_role`); las migraciones y los triggers de auth corren como
-- `postgres` / `supabase_auth_admin`.
--
-- OJO con `SET search_path = public`, acá y en cada guard: sin él, un trigger
-- disparado desde `supabase_auth_admin` (el `handle_email_confirmed` de 018,
-- que corre en TODO signup) hereda su search_path — solo `auth` — y la llamada
-- sin calificar falla con "function does not exist", rompiendo el registro de
-- usuarios entero. Es el mismo bug que 050 tuvo que corregir en
-- `handle_new_user`, y se reprodujo al escribir esta migración.
CREATE OR REPLACE FUNCTION danzclass_is_privileged()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user IN (
    'service_role', 'postgres', 'supabase_admin',
    'supabase_auth_admin', 'supabase_storage_admin'
  );
$$;

-- Estos dos sí son SECURITY DEFINER (patrón de `is_chat_participant` en 059):
-- el guard tiene que poder responder "¿es el profesor de esta clase?" sin que
-- la respuesta dependa de si el actor puede LEER la clase bajo RLS.
CREATE OR REPLACE FUNCTION is_class_teacher(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_event_creator(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e WHERE e.id = p_event_id AND e.creator_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION danzclass_is_privileged() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_class_teacher(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_event_creator(UUID) TO authenticated, anon, service_role;

-- (2) enrollments -------------------------------------------------------------
-- `status` es la decisión del profesor (o del servidor tras verificar un pago);
-- `hold_expires_at` es el lock de cupo de 055; `is_2x`/`partner_enrollment_id`
-- los escribe /api/class-2x/match. Ninguna de las cuatro es del alumno.
-- Mudar `class_id`/`student_id`/`session_id` convertiría una inscripción pagada
-- en otra distinta.
CREATE OR REPLACE FUNCTION enrollments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Hoy ningún cliente inserta inscripciones (todas nacen en
    -- /api/class/enroll, /api/class-2x/match o auditions/enroll-accepted, con
    -- service role). Si alguna vez vuelve a hacerlo, que al menos no pueda
    -- nacer confirmada ni con el cupo reservado.
    IF COALESCE(NEW.status, 'pending_payment') <> 'pending_payment'
       OR NEW.hold_expires_at IS NOT NULL
       OR COALESCE(NEW.is_2x, false)
       OR NEW.partner_enrollment_id IS NOT NULL THEN
      RAISE EXCEPTION 'enrollment_fields_not_writable'
        USING ERRCODE = '42501',
              HINT = 'La inscripción se crea vía /api/class/enroll.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.class_id     IS DISTINCT FROM OLD.class_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.hold_expires_at IS DISTINCT FROM OLD.hold_expires_at
     OR COALESCE(NEW.is_2x, false) IS DISTINCT FROM COALESCE(OLD.is_2x, false)
     OR NEW.partner_enrollment_id IS DISTINCT FROM OLD.partner_enrollment_id THEN
    RAISE EXCEPTION 'enrollment_fields_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Esas columnas las escribe el servidor.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- El profesor sí decide sobre sus alumnos: confirmar un pago recibido y
    -- eliminar a alguien de la clase son las dos acciones que hoy salen del
    -- cliente (MyClassesClient tab "Dicto" e Historial, y su espejo mobile).
    -- El alumno se da de baja por /api/class/leave, no por PATCH.
    IF NOT is_class_teacher(OLD.class_id) THEN
      RAISE EXCEPTION 'enrollment_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Solo el profesor de la clase (o el servidor) cambia el estado.';
    END IF;
    IF NEW.status NOT IN ('confirmed', 'cancelled') THEN
      RAISE EXCEPTION 'enrollment_status_transition_not_allowed'
        USING ERRCODE = '42501',
              HINT = 'El profesor solo puede confirmar o cancelar.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_write_guard_trigger ON enrollments;
CREATE TRIGGER enrollments_write_guard_trigger
  BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION enrollments_write_guard();

-- (3) profiles ----------------------------------------------------------------
-- `profiles_update_own` deja al dueño editar su fila entera, y ahí conviven
-- datos de perfil (libres) con flags que valen dinero o identidad:
--   referral_rewarded/referred_by → premio de referido repetible (+30 días Pro)
--   is_confirmed  → aparecer como cuenta verificada sin confirmar el correo
--   mp_connected  → habilitar el botón de pago MP sin conexión OAuth real
--   deleted_at    → tombstone de cuenta eliminada
--   role          → columna heredada, referenciada por policies de 001
CREATE OR REPLACE FUNCTION profiles_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR COALESCE(NEW.referral_rewarded, false) IS DISTINCT FROM COALESCE(OLD.referral_rewarded, false)
     OR COALESCE(NEW.is_confirmed, false) IS DISTINCT FROM COALESCE(OLD.is_confirmed, false)
     OR COALESCE(NEW.mp_connected, false) IS DISTINCT FROM COALESCE(OLD.mp_connected, false)
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'profile_fields_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Esas columnas las escribe el servidor.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_write_guard_trigger ON profiles;
CREATE TRIGGER profiles_write_guard_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_write_guard();

-- (4) event_enrollments -------------------------------------------------------
-- Mismo agujero que `enrollments`, con una diferencia: el flujo de eventos SÍ
-- es cliente-a-cliente (no hay rutas de servidor). El alumno marca su propio
-- "comprobante enviado" y el organizador confirma; nadie más.
CREATE OR REPLACE FUNCTION event_enrollments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending_payment') <> 'pending_payment' THEN
      RAISE EXCEPTION 'event_enrollment_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Una inscripción a evento nace pendiente de pago.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'event_enrollment_fields_not_writable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT is_event_creator(OLD.event_id)
     AND NOT (auth.uid() = OLD.user_id AND NEW.status IN ('payment_submitted', 'cancelled')) THEN
    RAISE EXCEPTION 'event_enrollment_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Solo el organizador confirma la entrada.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_enrollments_write_guard_trigger ON event_enrollments;
CREATE TRIGGER event_enrollments_write_guard_trigger
  BEFORE INSERT OR UPDATE ON event_enrollments
  FOR EACH ROW EXECUTE FUNCTION event_enrollments_write_guard();

-- (5) event_payments ----------------------------------------------------------
-- El equivalente de `payments_insert_student` para eventos, con el agravante de
-- que acá el insert del cliente SÍ es el flujo real: sube el comprobante. Lo
-- que no puede es declararlo verificado él mismo.
CREATE OR REPLACE FUNCTION event_payments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending') NOT IN ('pending', 'submitted') THEN
      RAISE EXCEPTION 'event_payment_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Solo el organizador verifica un pago.';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.amount IS DISTINCT FROM OLD.amount)
     AND NOT is_event_creator(OLD.event_id) THEN
    RAISE EXCEPTION 'event_payment_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Solo el organizador verifica un pago.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_payments_write_guard_trigger ON event_payments;
CREATE TRIGGER event_payments_write_guard_trigger
  BEFORE INSERT OR UPDATE ON event_payments
  FOR EACH ROW EXECUTE FUNCTION event_payments_write_guard();

-- (6) package_enrollments -----------------------------------------------------
-- Todo el ciclo de paquetes vive en /api/packages/* (service role): acá el
-- cliente no decide ningún estado.
CREATE OR REPLACE FUNCTION package_enrollments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'pending_payment') <> 'pending_payment' THEN
      RAISE EXCEPTION 'package_enrollment_status_not_writable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'package_enrollment_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'El estado del paquete lo escribe /api/packages/[id]/*.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS package_enrollments_write_guard_trigger ON package_enrollments;
CREATE TRIGGER package_enrollments_write_guard_trigger
  BEFORE INSERT OR UPDATE ON package_enrollments
  FOR EACH ROW EXECUTE FUNCTION package_enrollments_write_guard();

-- (7) class_2x_requests -------------------------------------------------------
-- El emparejamiento y el turno de pago los asigna /api/class-2x/match, y el
-- traspaso del turno tiene su propia ruta (transfer-payment). Del cliente solo
-- salen dos cosas: abrir la búsqueda y cancelarla.
CREATE OR REPLACE FUNCTION class_2x_requests_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF danzclass_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'looking') <> 'looking'
       OR NEW.matched_with IS NOT NULL
       OR NEW.payment_assignee IS NOT NULL THEN
      RAISE EXCEPTION 'twox_fields_not_writable'
        USING ERRCODE = '42501',
              HINT = 'El emparejamiento lo hace /api/class-2x/match.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.matched_with IS DISTINCT FROM OLD.matched_with
     OR NEW.payment_assignee IS DISTINCT FROM OLD.payment_assignee THEN
    RAISE EXCEPTION 'twox_fields_not_writable'
      USING ERRCODE = '42501',
            HINT = 'El turno de pago se transfiere por /api/class-2x/transfer-payment.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (auth.uid() = OLD.user_id AND NEW.status = 'cancelled') THEN
    RAISE EXCEPTION 'twox_status_not_writable'
      USING ERRCODE = '42501',
            HINT = 'Desde el cliente solo se puede cancelar la propia búsqueda.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_2x_requests_write_guard_trigger ON class_2x_requests;
CREATE TRIGGER class_2x_requests_write_guard_trigger
  BEFORE INSERT OR UPDATE ON class_2x_requests
  FOR EACH ROW EXECUTE FUNCTION class_2x_requests_write_guard();

-- (8) payments: cerrar la tabla al cliente ------------------------------------
-- Desde que existe POST /api/payment/submit-transfer (2026-07-28) ningún
-- cliente inserta pagos, y ninguno los actualiza salvo el /dashboard zombi que
-- audit.md P0-2 manda borrar (su botón "Confirmar" ya escribía por un camino
-- roto: sin QR, sin notificación, sin `confirmed_by`). Las dos policies son
-- superficie de ataque pura: con ellas, un alumno fabrica ingresos `verified`
-- en el Panel Financiero del profesor y en la conciliación tributaria de
-- /admin, y un profesor puede poner en cero la comisión de la plataforma.
-- Toda escritura legítima pasa por service role.
DROP POLICY IF EXISTS "payments_insert_student" ON payments;
DROP POLICY IF EXISTS "payments_update_teacher" ON payments;

-- (9) ratings: una sola puerta ------------------------------------------------
-- `ratings_insert_own` solo exigía `auth.uid() = rater_id`: cualquiera podía
-- valorar a cualquiera sin haber tomado nunca una clase (P1-5). La regla real
-- de elegibilidad (inscripción confirmada + clase ya ocurrida) vive en
-- /api/ratings/upsert y no se puede expresar razonablemente en una policy, así
-- que se deja esa ruta como único camino. `ratings_update_own` se va con ella:
-- sin WITH CHECK, permitía mover una valoración legítima a OTRO profesor.
DROP POLICY IF EXISTS "ratings_insert_own" ON ratings;
DROP POLICY IF EXISTS "ratings_update_own" ON ratings;

-- ============================================================
-- VERIFICACIÓN (correr después de aplicar):
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgname LIKE '%write_guard_trigger' ORDER BY 1;   -- deben ser 6
--
--   SELECT polname FROM pg_policy
--   WHERE polrelid IN ('payments'::regclass, 'ratings'::regclass) ORDER BY 1;
--   -- deben quedar solo payments_select_own y ratings_select_all
-- ============================================================
