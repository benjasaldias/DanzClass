-- ============================================================
-- 067_periodica_custom_dates_only.sql
-- ------------------------------------------------------------
-- Decisión de producto (audit.md §0, sesión S3): una clase PERIÓDICA no puede
-- extenderse más de un mes, y el único modo de definir sus fechas pasa a ser el
-- calendario (`recurrence = 'custom'`). Se elimina la posibilidad de crear
-- periódicas `weekly` / `biweekly` / `monthly`.
--
-- ALCANCE — SOLO `type = 'periodica'`.
-- Los ENTRENAMIENTOS conservan weekly/biweekly (+ `ends_at` / `ends_indefinitely`)
-- tal como están hoy: son programas continuos con audición e inscripción
-- permanente, y el modelo de cobro mensual de S4 se apoya en eso. Esta migración
-- no toca ninguna fila con `type = 'entrenamiento'` ni `type = 'suelta'`.
--
-- QUÉ HACE.
-- 1. Convierte cada clase `type='periodica'` que no sea ya `custom` a
--    `recurrence='custom'`, EXPANDIENDO todas sus ocurrencias reales a
--    `custom_dates`. La expansión reproduce exactamente lo que
--    `getClassSessions` (packages/shared/src/lib/classSchedule.ts) venía
--    mostrando: mismo ancla, mismo paso, mismo tope. No se pierde ninguna
--    sesión ni se toca ninguna inscripción ni pago.
-- 2. Agrega el CHECK `classes_periodica_custom_only`: `type <> 'periodica' OR
--    recurrence = 'custom'`.
--
-- LO QUE NO HACE, A PROPÓSITO.
-- El CHECK NO exige que las fechas caigan dentro de un mismo mes. Las clases ya
-- publicadas se convierten expandiendo TODO su calendario (una weekly de tres
-- meses queda con tres meses de fechas), porque truncarlas robaría sesiones a
-- alumnos que ya pagaron. La regla "un solo mes" se aplica en los formularios,
-- y solo cuando el profesor modifica el calendario — ver
-- `validatePeriodicaDates` en packages/shared.
--
-- ANCLA Y TOPE DE LA EXPANSIÓN (mismo criterio que getClassSessions):
--   - ancla  = `start_date`; si es NULL, `created_at::date` adelantado hasta el
--              `day_of_week` de la clase (que es lo que el formulario calculaba
--              al crearla, antes de que 024 persistiera `start_date`).
--   - tope   = `ends_at`; si es NULL o `ends_indefinitely`, ancla + 3 meses —
--              el mismo tope de seguridad que `getClassSessions` ya aplicaba a
--              las clases indefinidas, así que el alumno sigue viendo lo mismo
--              que veía ayer. (El formulario exige `ends_at` para periódica, así
--              que esta rama solo cubre datos legacy o escritos por API.)
--   - `monthly` respeta el día del mes recortado al último día disponible
--              (31 de enero → 28/29 de febrero), sin desbordar.
--
-- Aditiva e idempotente: no borra columnas ni filas, y volver a correrla no
-- cambia nada (las filas ya convertidas quedan fuera del WHERE).
--
-- ------------------------------------------------------------
-- ROLLBACK
-- ------------------------------------------------------------
-- La conversión es de una sola vía: al pasar a `custom_dates` se conserva
-- `recurrence` original en NINGÚN lado, así que el rollback exacto no es
-- posible sin un respaldo previo. Lo que sí se conserva intacto es
-- `day_of_week`, `start_date` y `ends_at`, de modo que una periódica se puede
-- devolver a semanal a mano si hiciera falta:
--
--   ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_periodica_custom_only;
--   -- y por cada clase que se quiera revertir (day_of_week/start_date/ends_at
--   -- siguen ahí):
--   -- UPDATE classes SET recurrence='weekly', custom_dates='{}'
--   --   WHERE id = '<uuid>';
--
-- ANTES DE APLICAR EN PRODUCCIÓN, tomar el respaldo de las filas afectadas:
--
--   CREATE TABLE IF NOT EXISTS _backup_067_periodicas AS
--   SELECT id, recurrence, day_of_week, start_date, ends_at, ends_indefinitely,
--          custom_dates, created_at
--   FROM classes WHERE type = 'periodica';
--
-- Y verificar el alcance real antes de correrla:
--
--   SELECT recurrence, count(*) FROM classes
--   WHERE type = 'periodica' GROUP BY recurrence;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Función de expansión (temporal: se elimina al final)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION danzclass_expand_periodica_dates(
  p_recurrence         TEXT,
  p_start_date         DATE,
  p_day_of_week        INT,      -- 0 = domingo … 6 = sábado (convención JS)
  p_created_at         DATE,
  p_ends_at            DATE,
  p_ends_indefinitely  BOOLEAN,
  p_existing           TEXT[]
) RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_anchor  DATE;
  v_end     DATE;
  v_cur     DATE;
  v_step    INT;
  v_day     INT;
  v_year    INT;
  v_month   INT;
  v_lastday INT;
  v_session DATE;
  v_out     TEXT[] := '{}';
  v_guard   INT := 0;
BEGIN
  -- Si ya tiene calendario propio, se respeta tal cual.
  IF p_existing IS NOT NULL AND array_length(p_existing, 1) > 0 THEN
    RETURN p_existing;
  END IF;

  -- Ancla.
  IF p_start_date IS NOT NULL THEN
    v_anchor := p_start_date;
  ELSIF p_day_of_week IS NOT NULL AND p_created_at IS NOT NULL THEN
    -- created_at adelantado hasta el día de la semana de la clase.
    -- EXTRACT(DOW) usa la misma convención que day_of_week: 0 = domingo.
    v_anchor := p_created_at
      + ((p_day_of_week - EXTRACT(DOW FROM p_created_at)::INT + 7) % 7);
  ELSE
    RETURN '{}';
  END IF;

  -- Tope.
  IF p_ends_at IS NOT NULL AND COALESCE(p_ends_indefinitely, FALSE) = FALSE THEN
    v_end := p_ends_at;
  ELSE
    v_end := (v_anchor + INTERVAL '3 months')::DATE;
  END IF;

  IF v_end < v_anchor THEN
    RETURN '{}';
  END IF;

  IF p_recurrence IN ('weekly', 'biweekly') THEN
    v_step := CASE WHEN p_recurrence = 'biweekly' THEN 14 ELSE 7 END;
    v_cur := v_anchor;
    WHILE v_cur <= v_end AND v_guard < 500 LOOP
      v_out := v_out || to_char(v_cur, 'YYYY-MM-DD');
      v_cur := v_cur + v_step;
      v_guard := v_guard + 1;
    END LOOP;
    RETURN v_out;
  END IF;

  IF p_recurrence = 'monthly' THEN
    v_day   := EXTRACT(DAY   FROM v_anchor)::INT;
    v_year  := EXTRACT(YEAR  FROM v_anchor)::INT;
    v_month := EXTRACT(MONTH FROM v_anchor)::INT;
    WHILE v_guard < 120 LOOP
      -- Último día del mes en curso, para recortar el 29/30/31.
      v_lastday := EXTRACT(
        DAY FROM (make_date(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')
      )::INT;
      v_session := make_date(v_year, v_month, LEAST(v_day, v_lastday));
      EXIT WHEN v_session > v_end;
      IF v_session >= v_anchor THEN
        v_out := v_out || to_char(v_session, 'YYYY-MM-DD');
      END IF;
      v_month := v_month + 1;
      IF v_month > 12 THEN v_month := 1; v_year := v_year + 1; END IF;
      v_guard := v_guard + 1;
    END LOOP;
    RETURN v_out;
  END IF;

  -- Recurrencia desconocida o NULL: al menos deja la clase con su ancla, para
  -- que no quede sin ninguna fecha y desaparezca del feed en silencio.
  RETURN ARRAY[to_char(v_anchor, 'YYYY-MM-DD')];
END;
$$;

-- ------------------------------------------------------------
-- 2. Conversión de las periódicas existentes
-- ------------------------------------------------------------
UPDATE classes
SET
  custom_dates = danzclass_expand_periodica_dates(
    recurrence,
    start_date,
    day_of_week,
    created_at::DATE,
    ends_at,
    ends_indefinitely,
    custom_dates
  ),
  recurrence = 'custom'
WHERE type = 'periodica'
  AND recurrence IS DISTINCT FROM 'custom';

-- `start_date` es el ancla del cálculo de sesiones: con calendario explícito
-- debe apuntar a la primera fecha marcada (mismo criterio que
-- `resolveClassStartDate` en packages/shared).
UPDATE classes
SET start_date = (SELECT MIN(d)::DATE FROM unnest(custom_dates) AS d)
WHERE type = 'periodica'
  AND array_length(custom_dates, 1) > 0
  AND (
    start_date IS NULL
    OR start_date <> (SELECT MIN(d)::DATE FROM unnest(custom_dates) AS d)
  );

-- `ends_at` deja de ser un campo que el profesor escribe: la última fecha del
-- calendario ES el término. Se mantiene sincronizado porque el filtro del feed
-- lo usa para descartar clases vencidas del lado del servidor.
UPDATE classes
SET ends_at = (SELECT MAX(d)::DATE FROM unnest(custom_dates) AS d),
    ends_indefinitely = FALSE
WHERE type = 'periodica'
  AND array_length(custom_dates, 1) > 0
  AND (
    ends_at IS DISTINCT FROM (SELECT MAX(d)::DATE FROM unnest(custom_dates) AS d)
    OR COALESCE(ends_indefinitely, FALSE) = TRUE
  );

DROP FUNCTION IF EXISTS danzclass_expand_periodica_dates(
  TEXT, DATE, INT, DATE, DATE, BOOLEAN, TEXT[]
);

-- ------------------------------------------------------------
-- 3. CHECK: una periódica solo puede ser 'custom'
-- ------------------------------------------------------------
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_periodica_custom_only;
ALTER TABLE classes ADD CONSTRAINT classes_periodica_custom_only
  CHECK (type IS DISTINCT FROM 'periodica' OR recurrence = 'custom');

COMMENT ON CONSTRAINT classes_periodica_custom_only ON classes IS
  'Migración 067: las clases periódicas definen sus fechas solo por calendario. '
  'weekly/biweekly/monthly siguen permitidos para type = ''entrenamiento''.';
