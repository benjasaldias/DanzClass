-- ============================================================
-- Migration 028: lock teacher_payment_info SELECT
-- ============================================================
-- La policy original `payment_info_select_all USING (true)` permitía a
-- cualquier visitante (anon o auth) leer datos bancarios del profesor
-- (banco, número de cuenta, RUT, titular). Ahora se restringe a:
--   - El propio profesor.
--   - Cualquier usuario con una inscripción activa en una clase de ese profesor.
--   - Service role (que bypasea RLS) sigue funcionando para los API routes.
-- ============================================================

DROP POLICY IF EXISTS "payment_info_select_all" ON teacher_payment_info;

CREATE POLICY "payment_info_select_owner_or_enrolled" ON teacher_payment_info
  FOR SELECT TO authenticated
  USING (
    auth.uid() = teacher_id
    OR EXISTS (
      SELECT 1 FROM enrollments e
      JOIN classes c ON c.id = e.class_id
      WHERE c.teacher_id = teacher_payment_info.teacher_id
        AND e.student_id = auth.uid()
        AND e.status IN ('pending_payment', 'payment_submitted', 'confirmed')
    )
  );
