-- Nuevo tipo de clase: Entrenamiento
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_type_check;
ALTER TABLE classes ADD CONSTRAINT classes_type_check
  CHECK (type IN ('suelta', 'periodica', 'entrenamiento'));

-- Columnas para entrenamiento y fecha de término
ALTER TABLE classes ADD COLUMN IF NOT EXISTS requires_audition BOOLEAN DEFAULT FALSE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS audition_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS ends_at DATE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS ends_indefinitely BOOLEAN DEFAULT FALSE;

-- Tabla de postulaciones (auditions)
CREATE TABLE IF NOT EXISTS auditions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INTEGER,
  phone TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, applicant_id)
);

ALTER TABLE auditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants can view own auditions"
  ON auditions FOR SELECT
  USING (auth.uid() = applicant_id);

CREATE POLICY "Teachers can view auditions for their classes"
  ON auditions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM classes WHERE id = auditions.class_id AND teacher_id = auth.uid()
  ));

CREATE POLICY "Users can submit auditions"
  ON auditions FOR INSERT
  WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Teachers can update audition status"
  ON auditions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM classes WHERE id = auditions.class_id AND teacher_id = auth.uid()
  ));

-- Bucket para videos de postulación (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audition-videos',
  'audition-videos',
  false,
  104857600,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Applicants can upload own audition videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audition-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Applicants and teachers can view audition videos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audition-videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM auditions a
        JOIN classes c ON c.id = a.class_id
        WHERE c.teacher_id = auth.uid()
        AND a.applicant_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- Constraint final de notificaciones con todos los tipos nuevos
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  '2x_request', '2x_match', '2x_payment_turn',
  'friend_request', 'friend_accepted',
  'payment_confirmed', 'payment_rejected',
  'follow', 'new_class', 'class_updated', 'class_cancelled', 'class_discount',
  'debt_warning', 'new_report',
  'audition_accepted', 'audition_rejected'
));
