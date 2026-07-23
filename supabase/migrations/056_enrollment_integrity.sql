-- ============================================================
-- 056_enrollment_integrity.sql
-- ------------------------------------------------------------
-- Integridad del modelo de cupos (auditoría pre-release 2026-07-22).
-- Cierra dos agujeros que solo aparecen con concurrencia real:
--
-- (P0-1) SOBRECUPO. La ruta /api/class/enroll hace leer-cupos → chequear →
--   insertar en 3 round-trips sin candado. Dos alumnos que reservan a la vez
--   leen ambos "queda 1 cupo", pasan el check e insertan → la clase supera
--   max_spots. Es justo el sobrecupo que la app promete evitar. Solución:
--   trigger BEFORE INSERT/UPDATE que toma un lock por clase (SELECT ... FOR
--   UPDATE sobre la fila de classes) y recuenta dentro de la misma transacción,
--   serializando las inscripciones concurrentes de esa clase. Cubre TODOS los
--   caminos de inserción (enroll, paquetes, audiciones aceptadas, 2x) sin
--   refactorizar cada ruta, y falla cerrado (nunca sobre-vende).
--
-- (P0-2) INSCRIPCIONES DUPLICADAS. La UNIQUE(student_id, class_id, session_id)
--   de 001 no sirve en el modelo actual: session_id es SIEMPRE NULL, y en
--   PostgreSQL un UNIQUE trata cada NULL como distinto, así que dos filas
--   (alumno, clase, NULL) no violan nada. La única barrera era el chequeo en
--   código, vulnerable a doble clic / doble request. Solución: índice único
--   PARCIAL que sí distingue NULLs y excluye las canceladas (para permitir
--   re-inscribirse tras cancelar).
--
-- Aditiva salvo por un dedup DEFENSIVO de inscripciones activas duplicadas
-- preexistentes (necesario para poder crear el índice único). En un entorno
-- limpio no toca ninguna fila.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS enforce_class_capacity_trigger ON enrollments;
--   DROP FUNCTION IF EXISTS enforce_class_capacity();
--   DROP INDEX IF EXISTS enrollments_unique_active;
-- ============================================================

-- (P0-2a) Dedup defensivo: si ya hubiera inscripciones activas duplicadas
-- (mismo alumno+clase, session_id NULL), conservar la "más avanzada" y cancelar
-- el resto, para que el índice único parcial pueda crearse sin error.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY student_id, class_id
      ORDER BY
        CASE status
          WHEN 'confirmed'         THEN 0
          WHEN 'payment_submitted' THEN 1
          WHEN 'pending_payment'   THEN 2
          ELSE 3
        END,
        created_at DESC
    ) AS rn
  FROM enrollments
  WHERE session_id IS NULL AND status <> 'cancelled'
)
UPDATE enrollments e
SET status = 'cancelled'
FROM ranked r
WHERE e.id = r.id AND r.rn > 1;

-- (P0-2b) Índice único parcial: un alumno no puede tener dos inscripciones
-- activas (no canceladas) a la misma clase en el modelo global (session_id NULL).
-- El segundo insert concurrente falla con 23505 → la ruta lo trata como
-- already_enrolled.
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_unique_active
  ON enrollments (student_id, class_id)
  WHERE session_id IS NULL AND status <> 'cancelled';

-- (P0-1) Trigger de capacidad con lock por clase.
CREATE OR REPLACE FUNCTION enforce_class_capacity() RETURNS trigger AS $$
DECLARE
  v_max        integer;
  v_taken      integer;
  new_occupies boolean;
  old_occupies boolean;
BEGIN
  -- Solo aplica al modelo de inscripción global (session_id NULL).
  IF NEW.session_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ¿La fila NUEVA ocupa un cupo? (misma lógica que la vista class_spots:
  -- no cancelada y, si es un hold, que no esté vencido).
  new_occupies := NEW.status <> 'cancelled'
    AND NOT (NEW.status = 'pending_payment'
             AND NEW.hold_expires_at IS NOT NULL
             AND NEW.hold_expires_at < now());

  -- Si no ocupa cupo (cancelación, o hold ya vencido), no hay nada que validar.
  IF NOT new_occupies THEN
    RETURN NEW;
  END IF;

  -- En UPDATE, solo validamos la TRANSICIÓN hacia "ocupa cupo". Si ya ocupaba
  -- antes (p. ej. confirmar un pago, rechazarlo, etc.), no re-chequeamos — así
  -- nunca bloqueamos operaciones sobre una fila que ya contaba, ni siquiera en
  -- una clase que quedó sobre-vendida por datos previos.
  IF TG_OP = 'UPDATE' THEN
    old_occupies := OLD.status <> 'cancelled'
      AND NOT (OLD.status = 'pending_payment'
               AND OLD.hold_expires_at IS NOT NULL
               AND OLD.hold_expires_at < now());
    IF old_occupies THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Lock por clase: serializa las inscripciones concurrentes de esta clase.
  -- La segunda transacción espera a que la primera confirme y recién ahí recuenta.
  SELECT max_spots INTO v_max FROM classes WHERE id = NEW.class_id FOR UPDATE;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_taken
  FROM enrollments e
  WHERE e.class_id = NEW.class_id
    AND e.session_id IS NULL
    AND e.id <> NEW.id
    AND e.status <> 'cancelled'
    AND NOT (e.status = 'pending_payment'
             AND e.hold_expires_at IS NOT NULL
             AND e.hold_expires_at < now());

  IF v_taken >= v_max THEN
    -- El texto del RAISE es el MESSAGE del error ('class_full'); la ruta lo mapea
    -- a no_spots. ERRCODE check_violation (23514) para distinguirlo del 23505 del
    -- índice único. (No repetir MESSAGE en el USING: PL/pgSQL lo prohíbe.)
    RAISE EXCEPTION 'class_full' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_class_capacity_trigger ON enrollments;
CREATE TRIGGER enforce_class_capacity_trigger
  BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION enforce_class_capacity();
