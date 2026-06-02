-- 041_storage_path_validation.sql
-- M-2: Refuerza las políticas INSERT de Storage para que solo el dueño
-- pueda subir archivos a su propia carpeta (path = UID/...).
-- Sin este fix, cualquier usuario autenticado puede sobreescribir archivos
-- ajenos si conoce el UUID de otro usuario.
--
-- Patrón: (storage.foldername(name))[1] = auth.uid()::text
-- Esto exige que el primer segmento del path sea el UID del usuario.

-- ── class-media ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "class-media: authenticated upload" ON storage.objects;
CREATE POLICY "class_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── avatars ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── posts-media ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "posts_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "posts-media: authenticated upload" ON storage.objects;
CREATE POLICY "posts_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'posts-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── event-media ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "event_media_insert" ON storage.objects;
CREATE POLICY "event_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── audition-videos ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audition_videos_upload" ON storage.objects;
DROP POLICY IF EXISTS "audition-videos: authenticated upload" ON storage.objects;
CREATE POLICY "audition_videos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audition-videos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
