-- ============================================================
-- Migration 006: extend notification types + INSERT policy
-- ============================================================

-- New notification types: follow, new_class, class_updated, class_cancelled
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow',
  'new_class',
  'class_updated',
  'class_cancelled'
));

-- Allow any authenticated user to insert notifications for any recipient.
-- Required for social features (follow, friend, class change notifications).
CREATE POLICY "notifications_insert_any" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow teachers to delete classes (needed for class cancellation flow)
-- The existing select policy already allows teacher to see their cancelled classes
-- DROP IF EXISTS: this policy is already created in 001_initial_schema.sql; guard added
-- so replaying the full migration history from scratch (e.g. local dev) doesn't fail.
DROP POLICY IF EXISTS "classes_delete_teacher" ON classes;
CREATE POLICY "classes_delete_teacher" ON classes
  FOR DELETE USING (auth.uid() = teacher_id);
