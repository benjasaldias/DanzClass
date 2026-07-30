-- ============================================================
-- 074_training_billing_since.sql
-- ------------------------------------------------------------
-- audit2.md P0-2 (sesión 2, 2026-07-29): "Un alumno de entrenamiento que se
-- va y vuelve hereda deuda de meses en que no estaba inscrito".
--
-- EL PROBLEMA. `generate_monthly_charges()` (068) ancla la ventana de cobro
-- de cada inscripción en `enrollments.created_at` — la fecha de la
-- INSCRIPCIÓN ORIGINAL. Cuando un alumno se va (`/api/class/leave`:
-- status → 'cancelled', la fila NO se borra) y el profesor lo vuelve a
-- aceptar más tarde (`/api/class/auditions/enroll-accepted`: UPDATE de la
-- MISMA fila a 'pending_payment', nunca un INSERT nuevo), `created_at` no se
-- mueve. La próxima vez que corre `generate_monthly_charges` factura, de una
-- sola pasada, TODOS los meses desde la inscripción original — incluidos los
-- que el alumno pasó fuera de la clase, sin estar inscrito en absoluto.
-- Verificado empíricamente antes de esta migración
-- (tests/integration/monthly-charges.spec.ts): un alumno inscrito hace 4
-- meses, cancelado, y reactivado hoy, terminaba debiendo 4 meses — 3 de ellos
-- (marzo, abril, mayo en la corrida real) en los que nunca estuvo inscrito.
--
-- LA SOLUCIÓN. `enrollments.billing_since` es el ancla real que
-- `generate_monthly_charges()` pasa a leer en vez de `created_at`. Se
-- mantiene con el mismo mecanismo que 066 usó para `pending_since` (P0-4 del
-- audit original): una columna derivada de transiciones de estado,
-- recalculada por el trigger `enrollments_write_guard` ANTES de cualquier
-- otra verificación, para que ningún camino de escritura —presente o
-- futuro— pueda olvidarse de actualizarla.
--
-- DIFERENCIA DELIBERADA CON `pending_since`. Esa columna es 100% derivada,
-- sin ninguna excepción: no hay ningún caso legítimo en que valga otra cosa
-- que lo que su fórmula calcula. `billing_since` sí necesita un margen: los
-- propios tests de este archivo retrodatan un valor para simular "se
-- inscribió hace 3 meses" sin esperar 3 meses reales — exactamente el mismo
-- margen que ya existe hoy, sin protección alguna, para `created_at`. Por
-- eso el trigger honra un valor explícito de un caller PRIVILEGIADO cuando
-- NO es una reactivación (INSERT, o UPDATE que no sale de 'cancelled'). Lo
-- que NO tiene excepción, ni siquiera para el service role, es la
-- REACTIVACIÓN en sí: salir de 'cancelled' SIEMPRE reinicia `billing_since`
-- a `now()`. Ese es, literalmente, el momento que este hallazgo dice que se
-- estaba perdiendo — dejarlo overridable habría dejado la puerta abierta a
-- que un caller futuro (o un test, o una corrección manual apurada) lo
-- vuelva a perder. Un cliente NO privilegiado nunca puede tocar esta columna
-- en ningún caso, igual que el resto de las columnas de `enrollments` que
-- representan una decisión ajena.
--
-- LA MITAD QUE FALTABA: `/api/class/leave` anulaba pagos con
-- `.in('status', ['pending', 'payment_submitted'])`. `'payment_submitted'`
-- NUNCA fue un valor válido de `payments.status` (ese string es de
-- `enrollments.status` — mismo tipo de confusión que la migración 064 ya
-- corrigió una vez), así que esa mitad del filtro era un no-op silencioso.
-- Más importante: `'due'` no estaba en la lista, así que los cargos
-- mensuales impagos —el caso que más importa acá— nunca se anulaban al
-- salir; quedaban flotando adjuntos al `enrollment_id`, listos para
-- "resucitar" si la fila se reactiva. Corregido en
-- `apps/web/src/app/api/class/leave/route.ts` (fuera de esta migración SQL,
-- no toca la base).
--
-- Aditiva e idempotente. No borra datos: sólo agrega la columna, la
-- backfillea y cambia cómo `generate_monthly_charges` calcula su ventana.
--
-- ⚠️ NO ES RETROACTIVA. Si algún alumno de entrenamiento YA fue facturado de
-- más en producción por este bug (se fue y volvió desde que existe el cobro
-- mensual, migración 068, 2026-07-28), esta migración no revierte los cargos
-- 'due'/'rejected' ya emitidos de más — no hay forma de reconstruir desde el
-- estado actual en qué meses la fila estuvo 'cancelled' (no se guarda
-- historial de transiciones). Diagnóstico manual, antes de aplicar en
-- producción o después si se sospecha un caso puntual:
--
--   SELECT e.id AS enrollment_id, e.student_id, e.class_id,
--          p.billing_period, p.status, p.amount
--   FROM enrollments e
--   JOIN classes c ON c.id = e.class_id AND c.type = 'entrenamiento'
--   JOIN payments p ON p.enrollment_id = e.id AND p.billing_period IS NOT NULL
--   WHERE e.status <> 'cancelled'
--   ORDER BY e.id, p.billing_period;
--
-- El remedio de un caso confirmado es anular a mano (`status='void'`) los
-- cargos 'due'/'rejected' de los meses en que el alumno no estuvo inscrito.
-- A partir de esta migración, cualquier NUEVA reactivación queda correcta
-- automáticamente.
--
-- ROLLBACK:
--   -- 1. Restaurar generate_monthly_charges() a la versión de 068 (usa
--   --    e.created_at en vez de e.billing_since).
--   -- 2. Restaurar enrollments_write_guard() a la versión de 066 (sin el
--   --    bloque de billing_since).
--   -- 3. ALTER TABLE enrollments DROP COLUMN IF EXISTS billing_since;
--   -- 4. Revertir el filtro de /api/class/leave a
--   --    .in('status', ['pending', 'payment_submitted']).
-- ============================================================

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS billing_since TIMESTAMPTZ;

-- Backfill: corre bajo el trigger VIEJO (066), que todavía no toca esta
-- columna — mismo orden que 066 usó para pending_since, para que el UPDATE de
-- abajo no sea neutralizado por el CREATE OR REPLACE que viene después. Se
-- asume `created_at`, que es EXACTAMENTE el valor (potencialmente incorrecto
-- para quien ya fue reactivado antes de esta migración) que la app usaba
-- hasta ahora. No empeora nada; el trigger nuevo corrige el reloj hacia
-- adelante desde acá para toda reactivación futura.
UPDATE enrollments SET billing_since = created_at WHERE billing_since IS NULL;

-- ------------------------------------------------------------
-- generate_monthly_charges(): billing_since en vez de created_at
-- ------------------------------------------------------------
-- Idéntica a la versión de 068 salvo la fuente de `v_first_month` (renombrado
-- `billed_since` para que el nombre refleje lo que representa ahora, ya no es
-- simplemente "cuándo se inscribió").
CREATE OR REPLACE FUNCTION generate_monthly_charges(p_enrollment_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today       DATE := (now() AT TIME ZONE 'America/Santiago')::date;
  v_created     INTEGER := 0;
  r             RECORD;
  v_first_month DATE;   -- primer día del primer mes que se debe
  v_last_month  DATE;   -- primer día del último mes que se debe
  v_cursor      DATE;
  v_billing_day SMALLINT;
  v_amount      INTEGER;
BEGIN
  FOR r IN
    SELECT e.id            AS enrollment_id,
           COALESCE(e.billing_since, e.created_at) AS billed_since,
           c.billing_day   AS billing_day,
           c.start_date    AS start_date,
           c.ends_at       AS ends_at,
           c.ends_indefinitely AS ends_indefinitely,
           c.teacher_id    AS teacher_id,
           COALESCE(c.discount_price_monthly, c.price) AS amount
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE c.type = 'entrenamiento'
      AND c.status = 'active'
      AND e.status <> 'cancelled'
      AND (p_enrollment_id IS NULL OR e.id = p_enrollment_id)
  LOOP
    v_billing_day := COALESCE(r.billing_day, 1);
    v_amount := r.amount;

    -- Sin precio no hay cargo que emitir (clase mal configurada): se salta en
    -- vez de generar deuda de $0, que ensuciaría el historial del alumno.
    CONTINUE WHEN v_amount IS NULL OR v_amount <= 0;

    -- Desde: el más tardío entre el inicio de la clase y el ancla de
    -- facturación de la inscripción (fecha original, o la de la reactivación
    -- más reciente si el alumno se fue y volvió — P0-2).
    v_first_month := date_trunc('month', GREATEST(
      COALESCE(r.start_date, (r.billed_since AT TIME ZONE 'America/Santiago')::date),
      (r.billed_since AT TIME ZONE 'America/Santiago')::date
    ))::date;

    -- Hasta: el mes en curso sólo si ya llegó el día de cobro.
    v_last_month := date_trunc('month', v_today)::date;
    IF EXTRACT(DAY FROM v_today) < v_billing_day THEN
      v_last_month := (v_last_month - INTERVAL '1 month')::date;
    END IF;

    -- El PRIMER mes del alumno (o de su reactivación) se emite apenas ocurre,
    -- sin esperar al día de cobro: quien entra el día 2 con cobro el 5 tiene
    -- que poder pagar su mensualidad de entrada ese mismo día, no quedarse
    -- tres días sin ninguna deuda que saldar (y por lo tanto sin forma de
    -- habilitar su QR). Nunca se emite un mes futuro: si la clase empieza el
    -- mes que viene, el bucle no llega a iterar.
    v_last_month := GREATEST(v_last_month, LEAST(v_first_month, date_trunc('month', v_today)::date));

    -- Clases con término: no se cobra más allá del mes en que termina.
    IF NOT COALESCE(r.ends_indefinitely, false) AND r.ends_at IS NOT NULL THEN
      v_last_month := LEAST(v_last_month, date_trunc('month', r.ends_at)::date);
    END IF;

    v_cursor := v_first_month;
    WHILE v_cursor <= v_last_month LOOP
      INSERT INTO payments (
        enrollment_id, amount, status, payment_method, commission_amount,
        billing_period, recipient_teacher_id, receipt_url, scan_status, ai_verdict
      ) VALUES (
        r.enrollment_id, v_amount, 'due', 'transfer', 0,
        to_char(v_cursor, 'YYYY-MM'), r.teacher_id, NULL, 'pending', 'none'
      )
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;

      v_cursor := (v_cursor + INTERVAL '1 month')::date;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION generate_monthly_charges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_monthly_charges(UUID) TO service_role;

-- ------------------------------------------------------------
-- enrollments_write_guard(): mantiene billing_since
-- ------------------------------------------------------------
-- ⚠️ Parte de la versión de `069` (no de `066`): 069 endureció la transición
-- de estado del profesor a SOLO 'cancelled' (P1-8 — confirmar dejó de salir
-- del cliente porque no emitía QR ni registraba el pago). Un CREATE OR
-- REPLACE que reproduzca una versión anterior de esta función REVIERTE ese
-- fix sin ningún error visible — exactamente lo que pasó al escribir esta
-- migración la primera vez: se copió el cuerpo de 066 en vez del de 069, y
-- `tests/integration/rls-guards.spec.ts` (el caso "profesor confirmando desde
-- el cliente debe fallar") lo detectó al correr la suite completa. Regla para
-- cualquier migración futura que toque este trigger: partir siempre de la
-- ÚLTIMA versión aplicada, nunca de la que documentó el hallazgo que la
-- introdujo.
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

  -- billing_since (audit2.md P0-2): ancla de facturación de entrenamientos
  -- que generate_monthly_charges() usa en vez de created_at. A diferencia de
  -- pending_since, SÍ admite un valor explícito de un caller PRIVILEGIADO
  -- cuando no se trata de una reactivación (backfills, correcciones
  -- administrativas, fixtures de test — el mismo margen que ya existe hoy,
  -- sin ninguna protección, para `created_at`). Lo que NO tiene excepción
  -- para nadie es la REACTIVACIÓN: salir de 'cancelled' siempre la reinicia a
  -- `now()`, sin importar qué escriba el caller — es exactamente el
  -- mecanismo que este hallazgo dice que se estaba perdiendo, y dejarlo
  -- overridable reabriría el bug con que un caller futuro lo omita.
  IF TG_OP = 'INSERT' THEN
    IF NOT danzclass_is_privileged() OR NEW.billing_since IS NULL THEN
      NEW.billing_since := now();
    END IF;
  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.billing_since := now();
  ELSIF NOT danzclass_is_privileged() THEN
    NEW.billing_since := OLD.billing_since;
  END IF;
  -- (si es privilegiado, no está insertando, y no es una reactivación: se
  -- deja tal cual llegó — es lo que permite retrodatar en tests/soporte.)

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
    -- S4/P1-8 (069): al profesor le queda SOLO cancelar (eliminar a un
    -- alumno de su clase). Confirmar dejó de salir del cliente porque ese
    -- camino no emitía el token QR ni registraba el pago: ahora va por
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
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'enrollments' AND column_name = 'billing_since';
--
--   SELECT count(*) FROM enrollments WHERE billing_since IS NULL;  -- debe ser 0
--
--   -- Confirmar que el guard sigue rechazando lo que rechazaba antes:
--   -- tests/integration/rls-guards.spec.ts debe seguir en verde.
--   -- Y la regresión específica de este hallazgo:
--   -- tests/integration/monthly-charges.spec.ts (los 2 tests "P0-2 (audit2)").
-- ============================================================
