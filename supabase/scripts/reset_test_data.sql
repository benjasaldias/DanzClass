-- ============================================================
-- reset_test_data.sql — Maintenance script (NOT a migration)
-- Cleans test data while preserving real user accounts,
-- their subscriptions, and payment info.
--
-- Real accounts preserved:
--   benjamingsaldiash@gmail.com
--   benjamn.saldas@uc.cl
--
-- Run this in: Supabase → SQL Editor (with service role)
-- ============================================================

-- Step 1: Delete all data tables (children before parents, FK order)
-- -------------------------------------------------------
DELETE FROM auditions;
DELETE FROM class_2x_requests;
DELETE FROM trust_endorsements;
DELETE FROM dismissed_debts;
DELETE FROM payments;
DELETE FROM enrollments;
DELETE FROM notifications;
DELETE FROM reports;
DELETE FROM follows;
DELETE FROM friendships;
DELETE FROM posts;
DELETE FROM class_media;
DELETE FROM class_sessions;
DELETE FROM classes;

-- Step 2: Delete test user subscriptions and payment info
-- (real user data is preserved; test users likely have none)
-- -------------------------------------------------------
DELETE FROM subscriptions
WHERE user_id NOT IN (
  SELECT id FROM auth.users
  WHERE email IN ('benjamingsaldiash@gmail.com', 'benjamn.saldas@uc.cl')
);

DELETE FROM teacher_payment_info
WHERE user_id NOT IN (
  SELECT id FROM auth.users
  WHERE email IN ('benjamingsaldiash@gmail.com', 'benjamn.saldas@uc.cl')
);

-- Step 3: Delete test user profiles
-- (must come after data tables that reference profiles)
-- -------------------------------------------------------
DELETE FROM profiles
WHERE id NOT IN (
  SELECT id FROM auth.users
  WHERE email IN ('benjamingsaldiash@gmail.com', 'benjamn.saldas@uc.cl')
);

-- Step 4: Delete test auth users
-- (must come after profiles, which reference auth.users)
-- -------------------------------------------------------
DELETE FROM auth.users
WHERE email NOT IN ('benjamingsaldiash@gmail.com', 'benjamn.saldas@uc.cl');

-- ============================================================
-- Verification — run after the DELETEs above complete
-- ============================================================
SELECT table_name, row_count FROM (
  SELECT 'auditions'         AS table_name, COUNT(*) AS row_count FROM auditions         UNION ALL
  SELECT 'class_2x_requests',               COUNT(*)              FROM class_2x_requests UNION ALL
  SELECT 'trust_endorsements',              COUNT(*)              FROM trust_endorsements UNION ALL
  SELECT 'dismissed_debts',                 COUNT(*)              FROM dismissed_debts    UNION ALL
  SELECT 'payments',                        COUNT(*)              FROM payments           UNION ALL
  SELECT 'enrollments',                     COUNT(*)              FROM enrollments        UNION ALL
  SELECT 'notifications',                   COUNT(*)              FROM notifications      UNION ALL
  SELECT 'reports',                         COUNT(*)              FROM reports            UNION ALL
  SELECT 'follows',                         COUNT(*)              FROM follows            UNION ALL
  SELECT 'friendships',                     COUNT(*)              FROM friendships        UNION ALL
  SELECT 'posts',                           COUNT(*)              FROM posts              UNION ALL
  SELECT 'class_media',                     COUNT(*)              FROM class_media        UNION ALL
  SELECT 'class_sessions',                  COUNT(*)              FROM class_sessions     UNION ALL
  SELECT 'classes',                         COUNT(*)              FROM classes
) t
ORDER BY table_name;

-- Verify real profiles still exist
SELECT p.id, p.username, u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id;
