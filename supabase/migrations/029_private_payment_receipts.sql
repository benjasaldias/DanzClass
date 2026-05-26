-- ============================================================
-- Migration 029: payment-receipts bucket → private + signed URLs
-- ============================================================
-- Antes: bucket público + policy SELECT con USING(true). Cualquiera con
-- la URL (incluyendo CDNs, caches, crawlers) podía ver el comprobante.
-- Después: bucket privado. Solo el estudiante uploader y el profesor
-- de la clase asociada pueden leer (vía signed URL emitida desde
-- /api/payment/receipt-url).
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'payment-receipts';

DROP POLICY IF EXISTS "payment_receipts_read" ON storage.objects;

-- SELECT: el uploader (estudiante) o el profesor de la clase relacionada.
-- Se busca un payment cuya receipt_url contenga el nombre del objeto.
CREATE POLICY "payment_receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM payments p
        JOIN enrollments e ON e.id = p.enrollment_id
        JOIN classes c ON c.id = e.class_id
        WHERE c.teacher_id = auth.uid()
          AND p.receipt_url LIKE '%' || storage.objects.name
      )
    )
  );
