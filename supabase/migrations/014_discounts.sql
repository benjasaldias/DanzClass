-- Descuentos espontáneos en clases
ALTER TABLE classes ADD COLUMN IF NOT EXISTS discount_price INTEGER;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS discount_price_monthly INTEGER;

-- Extender constraint de notificaciones con class_discount
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report'
));
