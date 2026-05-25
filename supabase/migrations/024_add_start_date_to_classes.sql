-- start_date was referenced in code (CreateClassForm, getClassSessions, agenda) but never added via migration.
-- This adds it as a nullable column so existing rows are unaffected.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_date DATE;
