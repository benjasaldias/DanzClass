-- 011_drop_music_columns.sql
-- Elimina las columnas de música de posts (feature descartada)

ALTER TABLE posts
  DROP COLUMN IF EXISTS music_id,
  DROP COLUMN IF EXISTS music_title,
  DROP COLUMN IF EXISTS music_artist,
  DROP COLUMN IF EXISTS music_preview_url;
