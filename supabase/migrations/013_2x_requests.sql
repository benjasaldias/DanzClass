-- Tabla de solicitudes 2x (pareja)
CREATE TABLE IF NOT EXISTS class_2x_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  matched_with UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'looking' CHECK (status IN ('looking', 'matched', 'cancelled')),
  payment_assignee UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, class_id)
);

ALTER TABLE class_2x_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view 2x requests"
  ON class_2x_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create own 2x requests"
  ON class_2x_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users involved can update 2x requests"
  ON class_2x_requests FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = matched_with);

CREATE POLICY "Users can delete own 2x requests"
  ON class_2x_requests FOR DELETE
  USING (auth.uid() = user_id);

-- Columnas 2x en enrollments
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_2x BOOLEAN DEFAULT FALSE;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS partner_enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL;

-- Precio 2x para suelta dentro de clase mensual
ALTER TABLE classes ADD COLUMN IF NOT EXISTS price_suelta_2x INTEGER;

-- Extender constraint de notificaciones con 2x_payment_turn
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled',
  'debt_warning', 'new_report'
));
