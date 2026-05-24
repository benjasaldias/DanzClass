-- Reemplaza el campo city de posts tipo video por una descripción breve
-- Los posts existentes sin description quedan con NULL (compatible)

ALTER TABLE posts ADD COLUMN IF NOT EXISTS description TEXT;
