-- Increase class-media bucket limit from 50 MB to 200 MB
-- A 1:30 min video at 1080p 30fps is ~195 MB; 200 MB gives sufficient headroom.
UPDATE storage.buckets
SET file_size_limit = 209715200  -- 200 MB
WHERE id = 'class-media';
