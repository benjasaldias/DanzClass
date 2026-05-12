-- Ensure the class-media bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'class-media',
  'class-media',
  true,
  52428800,  -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public           = true,
  file_size_limit  = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'];

-- Ensure the avatars bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public           = true,
  file_size_limit  = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- ============================================================
-- class-media: storage object policies
-- ============================================================
-- Drop if they already exist to avoid conflicts
DROP POLICY IF EXISTS "class_media_read"   ON storage.objects;
DROP POLICY IF EXISTS "class_media_upload" ON storage.objects;
DROP POLICY IF EXISTS "class_media_update" ON storage.objects;
DROP POLICY IF EXISTS "class_media_delete" ON storage.objects;

-- Anyone can read (bucket is public)
CREATE POLICY "class_media_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'class-media');

-- Authenticated users can upload
CREATE POLICY "class_media_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'class-media');

-- Authenticated users can update their uploads
CREATE POLICY "class_media_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'class-media');

-- Authenticated users can delete their uploads
CREATE POLICY "class_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'class-media');

-- ============================================================
-- avatars: storage object policies
-- ============================================================
DROP POLICY IF EXISTS "avatars_read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
