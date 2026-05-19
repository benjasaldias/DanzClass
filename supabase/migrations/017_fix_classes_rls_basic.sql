-- Fix: classes_insert_teacher policy omitted 'basic' tier.
-- Users with basic subscription received 403 on INSERT into classes.
-- Migration 002 replaced the role check but only included 'teacher' and 'pro'.

DROP POLICY IF EXISTS "classes_insert_teacher" ON classes;

CREATE POLICY "classes_insert_teacher" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() = teacher_id AND
    get_user_tier(auth.uid()) IN ('basic', 'teacher', 'pro')
  );
