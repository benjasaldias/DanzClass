-- Add price_suelta: optional single-class price for periodic classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS price_suelta INTEGER;

-- Add custom_dates: specific dates for custom-schedule periodic classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS custom_dates TEXT[] DEFAULT '{}';

-- Update recurrence check to allow 'custom' (drop old, add new)
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_recurrence_check;
ALTER TABLE classes ADD CONSTRAINT classes_recurrence_check
  CHECK (recurrence IS NULL OR recurrence IN ('weekly', 'biweekly', 'monthly', 'custom'));
