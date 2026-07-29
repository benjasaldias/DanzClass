-- ============================================================
-- 069_teacher_confirm_via_route.sql
-- ------------------------------------------------------------
-- Cierra P1-8 del audit: "el profesor confirma alumnos desde el cliente, por
-- fuera del flujo de pago".
--
-- QUÉ PASABA. La migración `065` blindó las columnas de decisión ajena de
-- `enrollments`, pero dejó al profesor cambiar `status` a 'confirmed' o
-- 'cancelled' desde el navegador. Fue una decisión consciente y registrada:
-- bloquearlo entonces habría roto dos pantallas vivas —el botón "Confirmar" del
-- Historial y "Eliminar alumno", en web y mobile— sin ofrecer alternativa.
--
-- El problema de ese camino no es de seguridad sino de completitud: un alumno
-- confirmado con un PATCH directo queda `confirmed` pero **sin token QR de
-- asistencia** (que sólo emite `autoConfirmPayment`), sin `payments` tocado
-- (sin `confirmed_by`/`confirmed_at`, el pago queda como estaba) y sin
-- confirmar al compañero de un 2x. Llega a la clase y el escáner lo rechaza.
--
-- LA ALTERNATIVA YA EXISTE. `POST /api/payment/confirm` con
-- `action: 'confirm_offline'` (migración 068, audit.md S4-5) registra un pago
-- recibido fuera de la app: crea o marca la fila de `payments` con
-- `offline_confirmed = true` y `confirmed_by = 'teacher'`, y confirma la
-- inscripción por el camino completo —QR incluido—. Con esa ruta desplegada, el
-- permiso de confirmar desde el cliente deja de tener uso legítimo.
--
-- QUÉ CAMBIA. El profesor pasa a poder mover `enrollments.status` únicamente a
-- 'cancelled' (eliminar a un alumno de su clase, que no tiene efectos
-- colaterales que emitir). Confirmar es ahora exclusivo del servidor.
--
-- ⚠️ ORDEN DE DESPLIEGUE. Esta migración va **con o después** del código de la
-- sesión S4. Si se aplica antes de desplegar, el botón "Confirmar" del profesor
-- (que todavía haría el PATCH viejo) falla con 42501 hasta que el deploy entre.
-- Al revés es seguro: el código nuevo llama a la ruta, que usa service role y
-- está exenta del guard.
--
-- Idempotente (CREATE OR REPLACE). No toca datos.
--
-- ROLLBACK: restaurar la versión de `enrollments_write_guard()` de
-- `066_enrollments_pending_since.sql` (idéntica a ésta salvo por el bloque
-- marcado "S4/P1-8" de más abajo, que allí acepta 'confirmed' además de
-- 'cancelled').
-- ============================================================

CREATE OR REPLACE FUNCTION enrollments_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- pending_since es 100% derivada de `status`: se recalcula para TODO
  -- caller, privilegiado o no, antes de cualquier otra verificación (066).
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
    -- S4/P1-8: al profesor le queda SOLO cancelar (eliminar a un alumno de su
    -- clase). Confirmar dejó de salir del cliente porque ese camino no emitía
    -- el token QR ni registraba el pago: ahora va por
    -- /api/payment/confirm { action: 'confirm_offline' }.
    IF NOT is_class_teacher(OLD.class_id) THEN
      RAISE EXCEPTION 'enrollment_status_not_writable'
        USING ERRCODE = '42501',
              HINT = 'Solo el profesor de la clase (o el servidor) cambia el estado.';
    END IF;
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'enrollment_status_transition_not_allowed'
        USING ERRCODE = '42501',
              HINT = 'Confirmar va por /api/payment/confirm; desde el cliente solo se puede cancelar.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- VERIFICACIÓN (correr después de aplicar):
--
--   -- tests/integration/rls-guards.spec.ts debe seguir en verde: incluye ya
--   -- el ataque "profesor confirmando desde el cliente" (debe fallar) y el
--   -- flujo legítimo "profesor cancelando" (debe seguir funcionando).
-- ============================================================
