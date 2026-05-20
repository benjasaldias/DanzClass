-- Add is_confirmed to profiles so client queries can filter unconfirmed accounts.
-- A trigger on auth.users keeps it in sync when email_confirmed_at is set.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false NOT NULL;

-- Backfill already-confirmed users
UPDATE profiles
SET is_confirmed = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL
);

-- Trigger function: flip is_confirmed when Supabase sets email_confirmed_at
CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles SET is_confirmed = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_confirmed();
