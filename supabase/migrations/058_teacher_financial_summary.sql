-- ============================================================
-- 058_teacher_financial_summary.sql
-- ------------------------------------------------------------
-- (P2-2) El Panel Financiero traía TODOS los pagos verified del profesor a JS
-- (sin límite ni fecha) y calculaba los agregados en el cliente — miles de filas
-- por visita a /financiero para un profesor con historia. Este RPC hace la
-- agregación en Postgres y devuelve un único JSON con:
--   total_income, unique_students, monthly_trend (6 meses), top_classes (5),
--   active_count, total_enrolled, total_confirmed.
-- La página solo trae, además, los pagos de detalle acotados a 6 meses.
--
-- SECURITY DEFINER + auth.uid(): el profesor solo obtiene SU propio resumen
-- (no acepta teacher_id como parámetro), así que no expone datos de terceros.
-- Bucketeo mensual en hora de Chile para casar con el eje del gráfico del cliente.
--
-- Nota: de paso corrige DOS bugs latentes del panel — la query previa
-- seleccionaba/ordenaba por payments.created_at y classes.price_monthly, ambas
-- columnas INEXISTENTES, así que las dos queries fallaban y el panel mostraba 0
-- en todo. Acá se agregan bien en SQL usando la fecha real del pago
-- (verified_at, con fallback a submitted_at).
--
-- Aditiva (solo crea una función). ROLLBACK:
--   DROP FUNCTION IF EXISTS teacher_financial_summary();
-- ============================================================

CREATE OR REPLACE FUNCTION teacher_financial_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH verified AS (
    SELECT p.amount,
           (COALESCE(p.verified_at, p.submitted_at) AT TIME ZONE 'America/Santiago') AS local_created,
           e.student_id, c.id AS class_id, c.title, c.dance_style
    FROM payments p
    JOIN enrollments e ON e.id = p.enrollment_id
    JOIN classes c ON c.id = e.class_id
    WHERE c.teacher_id = auth.uid() AND p.status = 'verified'
  ),
  months AS (
    SELECT to_char(
      date_trunc('month', (now() AT TIME ZONE 'America/Santiago')) - (interval '1 month' * g),
      'YYYY-MM'
    ) AS key
    FROM generate_series(0, 5) AS g
  ),
  monthly AS (
    SELECT m.key, COALESCE(SUM(v.amount), 0) AS total
    FROM months m
    LEFT JOIN verified v ON to_char(v.local_created, 'YYYY-MM') = m.key
    GROUP BY m.key
  ),
  topcls AS (
    SELECT class_id, title, dance_style, SUM(amount) AS income, COUNT(*) AS confirmed
    FROM verified
    GROUP BY class_id, title, dance_style
    ORDER BY SUM(amount) DESC
    LIMIT 5
  ),
  clsstats AS (
    SELECT
      COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active')      AS active_count,
      COUNT(e.id)          FILTER (WHERE e.status <> 'cancelled')  AS total_enrolled,
      COUNT(e.id)          FILTER (WHERE e.status = 'confirmed')   AS total_confirmed
    FROM classes c
    LEFT JOIN enrollments e ON e.class_id = c.id AND e.session_id IS NULL
    WHERE c.teacher_id = auth.uid() AND c.status IN ('active', 'completed')
  )
  SELECT jsonb_build_object(
    'total_income',   (SELECT COALESCE(SUM(amount), 0) FROM verified),
    'unique_students',(SELECT COUNT(DISTINCT student_id) FROM verified),
    'monthly_trend',  (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'total', total) ORDER BY key), '[]'::jsonb) FROM monthly),
    'top_classes',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', class_id, 'title', title, 'style', dance_style, 'income', income, 'confirmed', confirmed) ORDER BY income DESC), '[]'::jsonb) FROM topcls),
    'active_count',   COALESCE((SELECT active_count FROM clsstats), 0),
    'total_enrolled', COALESCE((SELECT total_enrolled FROM clsstats), 0),
    'total_confirmed',COALESCE((SELECT total_confirmed FROM clsstats), 0)
  );
$$;

REVOKE ALL ON FUNCTION teacher_financial_summary() FROM public;
GRANT EXECUTE ON FUNCTION teacher_financial_summary() TO authenticated;
