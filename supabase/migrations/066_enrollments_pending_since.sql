-- ============================================================
-- 066_enrollments_pending_since.sql
-- ------------------------------------------------------------
-- P0-4 del audit (audit.md, sesión S2): "rechazar un pago cancela la
-- inscripción del alumno al día siguiente".
--
-- EL PROBLEMA. Los 3 barridos del cron `cleanup-classes` que actúan sobre
-- `enrollments.status = 'pending_payment'` (timeout 2x de 7 días, reserva
-- impaga de 72h, recordatorio de pago de 24h) medían el tiempo con
-- `created_at` — la fecha de INSCRIPCIÓN ORIGINAL, que nadie vuelve a tocar.
-- Pero una fila vuelve a `pending_payment` varias veces en su vida sin que
-- `created_at` se mueva: al rechazar un comprobante (`/api/payment/confirm`),
-- al revertir la confirmación IA de un pago 2x (`unconfirmTwoxPartner` en
-- `lib/payments.ts`), o al reactivar una inscripción cancelada
-- (`/api/class/enroll`). Si un profesor rechaza un comprobante más de 72h
-- después de la inscripción original — el caso normal, no el excepcional —,
-- el cron de esa misma noche cancela al alumno que acaba de resubir y está
-- esperando una segunda revisión.
--
-- LA SOLUCIÓN. `enrollments.pending_since` registra cuándo la fila ENTRÓ al
-- estado `pending_payment` más reciente, no cuándo se creó la fila. Se
-- mantiene enteramente en el trigger `enrollments_write_guard` (ya existe
-- desde 065): se recalcula en cada INSERT/UPDATE, para TODO caller —
-- privilegiado o no — antes de cualquier otra cosa, así que ningún camino de
-- escritura (presente o futuro) puede olvidarse de actualizarla ni escribirle
-- un valor propio. Es la misma razón por la que 060 blindó `plan_hidden_at`
-- con un trigger en vez de confiar en que cada INSERT de `posts` se acuerde.
--
-- POR QUÉ NO EN LA MISMA COLUMNA QUE LOS 4 "PUNTOS DE ESCRITURA" DEL PLAN.
-- El plan de sesión (audit.md §7 S2) proponía setearla a mano en los 4 sitios
-- de app que llevan a `pending_payment`. Se prefirió el trigger porque (a) es
-- exactamente el mismo patrón de bug que este propio hallazgo demuestra —una
-- actualización de estado olvidada en un rincón del código—, y (b) porque
-- dejarla escribible desde la app reabriría el problema de fondo de P0-1: un
-- alumno podría mandar `pending_since` en el mismo PATCH que sí le está
-- permitido (p. ej. no hay ninguno hoy, pero bastaría uno futuro) y resetear
-- su propio reloj. Con el trigger, cualquier valor que un caller intente
-- escribir en `pending_since` se descarta y se reemplaza por el calculado.
--
-- Aditiva e idempotente. No requiere cambios en las policies de RLS
-- existentes (el trigger ya corre en `enrollments` para todo INSERT/UPDATE).
--
-- ROLLBACK:
--   -- 1. Restaurar la versión de la función previa a esta migración (ver
--   --    065_write_guards_rls.sql) o quitar el bloque marcado abajo.
--   -- 2. ALTER TABLE enrollments DROP COLUMN IF EXISTS pending_since;
--   -- 3. Revertir los 3 `.lt('pending_since', ...)` de
--   --    apps/web/src/app/api/cron/cleanup-classes/route.ts a `created_at`.
-- ============================================================

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS pending_since TIMESTAMPTZ;

-- Backfill: para las filas que hoy están pending_payment no hay forma de
-- reconstruir cuándo entraron a ese estado por última vez, así que se asume
-- su `created_at` — es exactamente el comportamiento (impreciso) que ya
-- tenían hasta ahora, no lo empeora, y el trigger corrige el reloj hacia
-- adelante desde acá.
UPDATE enrollments
SET pending_since = created_at
WHERE status = 'pending_payment' AND pending_since IS NULL;

CREATE OR REPLACE FUNCTION enrollments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- pending_since es 100% derivada de `status`: se recalcula para TODO
  -- caller, privilegiado o no, antes de cualquier otra verificación. Ningún
  -- valor que un caller intente escribir en esta columna sobrevive: se
  -- reemplaza siempre por el calculado acá.
  IF TG_OP = 'INSERT' THEN
    NEW.pending_since := CASE WHEN NEW.status = 'pending_payment' THEN now() ELSE NULL END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.pending_since := CASE WHEN NEW.status = 'pending_payment' THEN now() ELSE NULL END;
  ELSE
    NEW.pending_since := OLD.pending_since;
  END IF;

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

-- ============================================================
-- VERIFICACIÓN (correr después de aplicar):
--
--   SELECT status, pending_since IS NOT NULL AS has_pending_since
--   FROM enrollments WHERE status = 'pending_payment';  -- has_pending_since debe ser TRUE en todas
--
--   -- Confirmar que el guard sigue rechazando lo que rechazaba antes de esta
--   -- migración: tests/integration/rls-guards.spec.ts debe seguir en verde.
-- ============================================================
