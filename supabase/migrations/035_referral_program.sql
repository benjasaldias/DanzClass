-- F-10: Referral program
-- Each user gets a unique 8-char referral code.
-- When a referred user subscribes for the first time, both get +30 days Pro.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper: generate random 8-char alphanumeric code
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * 36 + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Backfill referral codes for existing profiles
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE referral_code IS NULL LOOP
    LOOP
      v_code := generate_referral_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_code);
    END LOOP;
    UPDATE profiles SET referral_code = v_code WHERE id = r.id;
  END LOOP;
END;
$$;

-- Update handle_new_user trigger to auto-generate referral_code and resolve referred_by
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_referred_by UUID;
  v_ref_code TEXT;
BEGIN
  -- Generate unique referral code
  LOOP
    v_ref_code := generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_ref_code);
  END LOOP;

  -- Resolve referrer from ref_code metadata (if provided at signup)
  IF NEW.raw_user_meta_data->>'ref_code' IS NOT NULL THEN
    SELECT id INTO v_referred_by
    FROM profiles
    WHERE referral_code = NEW.raw_user_meta_data->>'ref_code'
    LIMIT 1;
  END IF;

  INSERT INTO profiles (id, username, full_name, role, referral_code, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    v_ref_code,
    v_referred_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
