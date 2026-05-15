-- Add class_type to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS class_type TEXT CHECK (class_type IN ('coreografía', 'freestyle', 'otro'));

-- Add visibility to posts (replaces is_public logic)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
ALTER TABLE posts ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('public', 'followers', 'friends'));

-- Backfill: posts that were not public → 'followers'
UPDATE posts SET visibility = 'followers' WHERE is_public = false AND visibility = 'public';
