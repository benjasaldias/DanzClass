-- ============================================================
-- DanceClass - Migration 003: Dance styles & profile fields
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS styles_dancing  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS styles_teaching TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enrolled_classes_public BOOLEAN DEFAULT TRUE;
