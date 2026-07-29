-- ============================================================
-- 068_training_monthly_charges.sql
-- ------------------------------------------------------------
-- S4 del audit (audit.md §7): "Entrenamientos: cobro mensual con deuda
-- acumulada".
--
-- EL PROBLEMA. `classes.billing_day` existe desde la migración 025, se pide en
-- los 4 formularios de clase y se muestra en tres pantallas ("Cobro mensual el
-- día N de cada mes")… y no dispara ningún cobro. Es el ejemplo que el §1 del
-- audit usa para su tercera clase de defecto: piezas que se guardan, se
-- muestran y no hacen nada. Un entrenamiento cobra UNA vez (la inscripción) y
-- nunca más.
--
-- EL MODELO NUEVO (decisión de producto, audit.md §0). El alumno de un
-- entrenamiento queda inscrito de forma PERMANENTE tras la audición. Cada mes
-- se le genera un cargo. Los meses impagos se ACUMULAN: ninguno se cancela ni
-- se borra, y la inscripción nunca se cancela por impago. La única consecuencia
-- de no pagar es perder el QR de acceso a la clase (gate en
-- /api/attendance/scan). El profesor puede además confirmar un pago recibido
-- fuera de la app (efectivo), sin comprobante.
--
-- ------------------------------------------------------------
-- POR QUÉ ESTA MIGRACIÓN ES DELICADA
-- ------------------------------------------------------------
-- `payments_enrollment_id_key UNIQUE(enrollment_id)` (migración 001) es un
-- supuesto grabado en toda la app: "un enrollment ↔ un pago". De él dependen
-- `PaymentClient`, `MyClassesClient`, el Panel Financiero, la conciliación de
-- /admin, el escaneo IA, el webhook de Mercado Pago y `autoConfirmPayment`.
-- Además PostgREST lo usa para decidir si un embed `payment:payments(*)`
-- devuelve un OBJETO o un ARRAY: al quitar la constraint, **todos** esos
-- embeds pasan a array en silencio (sin error de compilación y sin error en
-- runtime — simplemente `enrollment.payment.status` queda `undefined`).
--
-- Por eso el unique NO se elimina sin reemplazo: se parte en dos índices
-- únicos PARCIALES que preservan exactamente la vieja invariante donde
-- siempre valió, y sólo la relajan donde el modelo nuevo lo exige.
--
--   * `payments_one_per_enrollment`  UNIQUE(enrollment_id) WHERE billing_period IS NULL
--       → clases sueltas, periódicas, 2x, paquetes: siguen teniendo como
--         máximo UN pago por inscripción, igual que antes de esta migración.
--   * `payments_one_per_period`      UNIQUE(enrollment_id, billing_period) WHERE billing_period IS NOT NULL
--       → entrenamientos: un cargo por inscripción y mes. Es también el guard
--         de idempotencia de `generate_monthly_charges()`.
--
-- `billing_period IS NOT NULL` es, entonces, el discriminador: una fila de
-- `payments` con período es un cargo mensual de entrenamiento; sin período es
-- un pago único como los de siempre. Todo código que cree pagos debe respetar
-- esa regla (ver `submit-transfer` y `create-payment`).
--
-- ------------------------------------------------------------
-- ESTADO 'due' — POR QUÉ HACE FALTA UNO NUEVO
-- ------------------------------------------------------------
-- Hasta ahora una fila de `payments` sólo nacía cuando el alumno YA había
-- hecho algo (subir comprobante o iniciar el checkout de MP), y `status`
-- arrancaba en 'pending' = "esperando revisión del profesor". Un cargo mensual
-- nace ANTES de que el alumno haga nada: es deuda emitida, no un pago por
-- revisar. Reusar 'pending' habría metido cada cargo generado en la bandeja de
-- "pagos por verificar" del profesor, con un comprobante inexistente.
--
--   due       → cargo emitido, el alumno no ha pagado (o su pago fue anulado)
--   pending   → el alumno pagó / subió comprobante, falta revisión del profesor
--   verified  → pagado y confirmado (IA, profesor, MP, o confirmación offline)
--   rejected  → el profesor rechazó el comprobante (vuelve a contar como deuda)
--   void      → anulado (inscripción cancelada, etc.)
--
-- Deuda = cargos en ('due','rejected'). 'pending' NO cuenta como deuda vencida
-- para el QR: el alumno ya hizo su parte y el retraso es de la revisión.
--
-- ------------------------------------------------------------
-- Aditiva e idempotente. No borra datos: el backfill sólo RELLENA
-- `billing_period` en pagos de entrenamiento que hoy lo tienen NULL.
--
-- ⚠️ RESPALDO ANTES DE APLICAR EN PRODUCCIÓN (la constraint que se elimina no
-- se puede recrear si mientras tanto se insertó un segundo pago):
--   SELECT id, enrollment_id, amount, status, submitted_at
--   FROM payments ORDER BY submitted_at;
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS generate_monthly_charges(uuid);
--   DROP INDEX IF EXISTS payments_one_per_period;
--   DROP INDEX IF EXISTS payments_one_per_enrollment;
--   DROP INDEX IF EXISTS payments_enrollment_status_idx;
--   -- Requiere que no haya más de un pago por enrollment (borrar los cargos
--   -- mensuales generados: DELETE FROM payments WHERE billing_period IS NOT NULL
--   -- AND status = 'due';) y que ninguna fila haya quedado en 'due':
--   ALTER TABLE payments ADD CONSTRAINT payments_enrollment_id_key UNIQUE (enrollment_id);
--   ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
--   ALTER TABLE payments ADD CONSTRAINT payments_status_check
--     CHECK (status IN ('pending','verified','rejected','void'));
--   ALTER TABLE payments DROP COLUMN IF EXISTS billing_period;
--   ALTER TABLE payments DROP COLUMN IF EXISTS offline_confirmed;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------

-- Período de facturación 'YYYY-MM'. NULL = pago único (todo lo que no es un
-- cargo mensual de entrenamiento).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS billing_period TEXT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_billing_period_format;
ALTER TABLE payments ADD CONSTRAINT payments_billing_period_format
  CHECK (billing_period IS NULL OR billing_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- Marca explícita de "el profesor registró un pago recibido fuera de la app"
-- (efectivo, transferencia directa que no se subió). Es la vía más fácil de
-- abusar del sistema de cobro, así que queda con rastro propio en vez de
-- deducirse de `receipt_url IS NULL`, que también es cierto para pagos MP.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS offline_confirmed BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2. Estado 'due'
-- ------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('due', 'pending', 'verified', 'rejected', 'void'));

-- ------------------------------------------------------------
-- 3. Backfill de `billing_period` en los pagos de entrenamiento existentes
-- ------------------------------------------------------------
-- Antes de esta migración cada inscripción de entrenamiento tenía como mucho
-- UN pago (el de la inscripción). Se le asigna el mes en que se registró, en
-- hora de Chile — el mismo huso con el que se generan los cargos nuevos y con
-- el que el Panel Financiero bucketea (ver 058). Sin este backfill, el primer
-- cargo generado colisionaría conceptualmente con ese pago (se cobraría dos
-- veces el mes de inscripción).
--
-- Idempotente: sólo toca filas con billing_period IS NULL.
UPDATE payments p
SET billing_period = to_char(
  (COALESCE(p.submitted_at, now()) AT TIME ZONE 'America/Santiago'), 'YYYY-MM'
)
FROM enrollments e
JOIN classes c ON c.id = e.class_id
WHERE e.id = p.enrollment_id
  AND c.type = 'entrenamiento'
  AND p.billing_period IS NULL;

-- ------------------------------------------------------------
-- 4. Unicidad: la vieja constraint se parte en dos índices parciales
-- ------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_enrollment_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_enrollment
  ON payments (enrollment_id)
  WHERE billing_period IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_period
  ON payments (enrollment_id, billing_period)
  WHERE billing_period IS NOT NULL;

-- Deuda por inscripción: se consulta en cada carga de la pantalla de pago, del
-- tab "Dicto" y en cada escaneo de QR.
CREATE INDEX IF NOT EXISTS payments_enrollment_status_idx
  ON payments (enrollment_id, status);

-- ------------------------------------------------------------
-- 5. generate_monthly_charges() — emisión de cargos, idempotente
-- ------------------------------------------------------------
-- Genera TODOS los períodos faltantes de cada inscripción de entrenamiento
-- activa, no solo el del mes en curso. Es deliberado: así la función se
-- auto-repara (un cron caído una semana, una inscripción creada antes de que
-- existiera el cron, o un mes en que Vercel no ejecutó el job no dejan huecos
-- silenciosos en la deuda), y el resultado no depende de con qué frecuencia se
-- la llame. Llamarla dos veces el mismo día no crea nada: la unicidad de
-- `payments_one_per_period` la hace idempotente vía ON CONFLICT DO NOTHING.
--
-- Ventana de períodos de una inscripción:
--   desde  = mes de MAX(inicio de la clase, inscripción del alumno)
--   hasta  = mes en curso si hoy ya pasó el `billing_day`, si no el anterior;
--            acotado por el mes de `ends_at` cuando la clase tiene término.
--
-- Monto: precio mensual vigente al momento de emitir (descuento incluido).
-- A diferencia del resto de la app —donde el precio se resuelve al PAGAR (ver
-- "Política de precio al momento de pago" en CLAUDE.md)—, un cargo mensual
-- congela su monto al emitirse: es deuda ya devengada de un mes concreto, y si
-- el precio cambiara, la deuda acumulada del alumno se movería sola hacia
-- atrás. Un cargo ya generado NUNCA se reprecia.
--
-- SECURITY DEFINER + search_path: sólo la llaman el cron y las rutas de
-- servidor (service role); no se otorga EXECUTE a authenticated/anon.
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
           e.created_at    AS enrolled_at,
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

    -- Desde: el más tardío entre el inicio de la clase y la inscripción.
    v_first_month := date_trunc('month', GREATEST(
      COALESCE(r.start_date, (r.enrolled_at AT TIME ZONE 'America/Santiago')::date),
      (r.enrolled_at AT TIME ZONE 'America/Santiago')::date
    ))::date;

    -- Hasta: el mes en curso sólo si ya llegó el día de cobro.
    v_last_month := date_trunc('month', v_today)::date;
    IF EXTRACT(DAY FROM v_today) < v_billing_day THEN
      v_last_month := (v_last_month - INTERVAL '1 month')::date;
    END IF;

    -- El PRIMER mes del alumno se emite apenas se inscribe, sin esperar al día
    -- de cobro: quien entra el día 2 con cobro el 5 tiene que poder pagar su
    -- mensualidad de entrada ese mismo día, no quedarse tres días sin ninguna
    -- deuda que saldar (y por lo tanto sin forma de habilitar su QR). Nunca se
    -- emite un mes futuro: si la clase empieza el mes que viene, el bucle no
    -- llega a iterar.
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

COMMENT ON COLUMN payments.billing_period IS
  'Mes facturado (YYYY-MM) de un cargo mensual de entrenamiento. NULL = pago único.';
COMMENT ON COLUMN payments.offline_confirmed IS
  'true = el profesor registró un pago recibido fuera de la app (sin comprobante).';
