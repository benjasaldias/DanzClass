-- Add soft-delete support for user accounts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for cron hard-delete after 30 days
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON profiles (deleted_at) WHERE deleted_at IS NOT NULL;
