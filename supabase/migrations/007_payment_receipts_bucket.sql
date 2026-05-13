-- Bucket para comprobantes de pago (público: las rutas incluyen UUIDs opacos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

-- Políticas RLS para payment-receipts
DROP POLICY IF EXISTS "payment_receipts_read"   ON storage.objects;
DROP POLICY IF EXISTS "payment_receipts_upload" ON storage.objects;
DROP POLICY IF EXISTS "payment_receipts_update" ON storage.objects;
DROP POLICY IF EXISTS "payment_receipts_delete" ON storage.objects;

-- Cualquiera puede leer (bucket público, rutas con UUID difícil de adivinar)
CREATE POLICY "payment_receipts_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-receipts');

-- Solo el estudiante puede subir dentro de su propia carpeta {user_id}/...
CREATE POLICY "payment_receipts_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- El estudiante puede actualizar sus propios archivos
CREATE POLICY "payment_receipts_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- El estudiante puede eliminar sus propios archivos
CREATE POLICY "payment_receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
