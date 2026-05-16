-- Add new_report notification type for superadmin alerts
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    '2x_request',
    '2x_match',
    'friend_request',
    'friend_accepted',
    'payment_confirmed',
    'payment_rejected',
    'follow',
    'new_class',
    'class_updated',
    'class_cancelled',
    'debt_warning',
    'new_report'
  ));
