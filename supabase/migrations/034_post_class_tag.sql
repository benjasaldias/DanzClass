-- F-15: Video de clase etiquetado
-- Allows students to tag a class when uploading a post video.
-- If the class is deleted (soft-delete sets status='cancelled', not a real delete),
-- ON DELETE SET NULL ensures the tag is cleared gracefully.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
