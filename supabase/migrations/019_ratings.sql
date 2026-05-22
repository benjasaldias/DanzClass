-- Sistema de valoraciones 1-5 estrellas (con medias estrellas)
-- Reemplaza el sistema de confianza (trust_endorsements) en la UI
-- La tabla trust_endorsements se mantiene en DB para compatibilidad

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rated_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars NUMERIC(2,1) NOT NULL CHECK (
    stars >= 1.0 AND
    stars <= 5.0 AND
    (stars * 2) = FLOOR(stars * 2)
  ),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (rater_id, rated_user_id),
  CHECK (rater_id <> rated_user_id)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings_select_all" ON ratings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ratings_insert_own" ON ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "ratings_update_own" ON ratings
  FOR UPDATE USING (auth.uid() = rater_id);
