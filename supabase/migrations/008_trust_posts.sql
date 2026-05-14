-- ═══════════════════════════════════════════════════════════════
-- 008_trust_posts.sql
-- Trust endorsements, posts (choreography videos), updated plans
-- ═══════════════════════════════════════════════════════════════

-- ─── Trust endorsements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_endorsements (
  endorser_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endorsed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (endorser_id, endorsed_id),
  CHECK (endorser_id != endorsed_id)
);

ALTER TABLE trust_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_select"  ON trust_endorsements FOR SELECT USING (true);
CREATE POLICY "trust_insert"  ON trust_endorsements FOR INSERT WITH CHECK (auth.uid() = endorser_id);
CREATE POLICY "trust_delete"  ON trust_endorsements FOR DELETE USING  (auth.uid() = endorser_id);

-- ─── Posts (choreography videos) ────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  video_url     TEXT,
  thumbnail_url TEXT,
  is_public     BOOLEAN     NOT NULL DEFAULT TRUE,
  city          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select"  ON posts FOR SELECT USING  (is_public = true OR auth.uid() = user_id);
CREATE POLICY "posts_insert"  ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update"  ON posts FOR UPDATE USING   (auth.uid() = user_id);
CREATE POLICY "posts_delete"  ON posts FOR DELETE USING   (auth.uid() = user_id);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Storage bucket: posts-media ────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posts-media',
  'posts-media',
  true,
  104857600, -- 100 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "posts_media_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'posts-media');

CREATE POLICY "posts_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'posts-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "posts_media_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'posts-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "posts_media_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'posts-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── Notification types: add debt_warning ───────────────────────
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'follow',
      'friend_request',
      'friend_accepted',
      'new_class',
      'class_updated',
      'class_cancelled',
      'payment_confirmed',
      'payment_rejected',
      '2x_request',
      '2x_match',
      'debt_warning'
    )
  );

-- ─── Dismissed debts: quick way for teacher to clear a debtor ───
CREATE TABLE IF NOT EXISTS dismissed_debts (
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (teacher_id, student_id)
);

ALTER TABLE dismissed_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissed_debts_select" ON dismissed_debts
  FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "dismissed_debts_insert" ON dismissed_debts
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "dismissed_debts_delete" ON dismissed_debts
  FOR DELETE USING (auth.uid() = teacher_id);
