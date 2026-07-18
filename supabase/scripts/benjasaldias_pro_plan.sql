INSERT INTO subscriptions (user_id, tier, status, started_at, expires_at)
SELECT id, 'pro', 'active', NOW(), NOW() + INTERVAL '1 year'
FROM profiles
WHERE username = 'benjasaldias';
