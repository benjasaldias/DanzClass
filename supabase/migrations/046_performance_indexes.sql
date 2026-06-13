-- ============================================================
-- 045_performance_indexes.sql
-- ------------------------------------------------------------
-- Production-readiness pass (2026-06-13): add the foreign-key /
-- filter / sort indexes the hot read paths depend on.
--
-- WHY: PostgreSQL does NOT auto-create indexes on foreign keys.
-- Only PRIMARY KEY and UNIQUE constraints get implicit indexes.
-- An audit of the feed / layout / my-classes / financial / explore
-- paths found these columns are filtered/joined/ordered on every
-- request but had no usable index (composite UNIQUEs that lead with
-- a different column do NOT help these single-column lookups):
--
--   * notifications(user_id, read)  -> unread-count runs on EVERY page load (layout.tsx)
--   * enrollments(class_id)         -> class_spots view JOIN + feed embedded count
--   * classes(status, created_at)   -> global feed order; classes(teacher_id) -> following/profile/my-classes
--   * posts(user_id), posts(created_at) -> feed
--   * follows(following_id)         -> follower lookups ("who follows me")
--   * ratings(rated_user_id)        -> feed teacher-ratings batch (UNIQUE leads with rater_id)
--   * payments(status)              -> financial panel (enrollment_id is already UNIQUE-indexed)
--   * events(status, event_date), events(creator_id) -> feed
--   * class_media(class_id)         -> feed media join
--   * class_2x_requests(user_id, status) -> feed "friends looking for 2x"
--
-- All are CREATE INDEX IF NOT EXISTS (idempotent). At current scale the
-- table-level lock is sub-second. On a large/busy production table,
-- run the equivalent CREATE INDEX CONCURRENTLY manually instead (it
-- cannot run inside the transaction the migration runner uses).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_notifications_user_unread, idx_enrollments_class_id,
--     idx_classes_status_created, idx_classes_teacher, idx_classes_city,
--     idx_posts_user, idx_posts_created, idx_follows_following,
--     idx_ratings_rated_user, idx_payments_status, idx_events_status_date,
--     idx_events_creator, idx_class_media_class, idx_2x_user_status;
-- ============================================================

-- Runs on every authenticated page load (TopBar unread badge). Partial
-- index keeps it tiny — only unread rows are stored.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

-- class_spots view JOIN (e.class_id) and the feed's embedded enrollment
-- count. The UNIQUE(student_id, class_id, session_id) leads with
-- student_id, so class_id lookups currently seq-scan enrollments.
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id
  ON enrollments (class_id);

-- Global feed: WHERE status='active' ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_classes_status_created
  ON classes (status, created_at DESC);

-- Following filter, teacher public profile, my-classes "dicto" tab.
CREATE INDEX IF NOT EXISTS idx_classes_teacher
  ON classes (teacher_id);

-- "Cerca" city fallback when geolocation is unavailable.
CREATE INDEX IF NOT EXISTS idx_classes_city
  ON classes (city);

-- Feed posts: by author (following filter) and by recency.
CREATE INDEX IF NOT EXISTS idx_posts_user
  ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created
  ON posts (created_at DESC);

-- "Who follows me" (follower counts, follow-notification targeting).
-- The PK (follower_id, following_id) only helps follower_id lookups.
CREATE INDEX IF NOT EXISTS idx_follows_following
  ON follows (following_id);

-- Feed/profile teacher-ratings batch. UNIQUE(rater_id, rated_user_id)
-- leads with rater_id, so rated_user_id needs its own index.
CREATE INDEX IF NOT EXISTS idx_ratings_rated_user
  ON ratings (rated_user_id);

-- Financial panel filters payments by status (e.g. 'verified').
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);

-- Feed events: WHERE status='active' AND event_date >= today, and the
-- "following" creator filter.
CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON events (status, event_date);
CREATE INDEX IF NOT EXISTS idx_events_creator
  ON events (creator_id);

-- Feed media join (class_media embedded under each class).
CREATE INDEX IF NOT EXISTS idx_class_media_class
  ON class_media (class_id);

-- Feed "amigos buscando 2x": IN (friendIds) AND status='looking'.
CREATE INDEX IF NOT EXISTS idx_2x_user_status
  ON class_2x_requests (user_id, status);
