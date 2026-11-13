-- 2026-11-12, A/B tests: the variants of Roblox's experiments (Creator Hub, Config keys) each player got, as the game
-- sends them with every send (meta.ab), so the dashboard shows the split live instead of days later.
-- No new index: /api/ab reads the window by start (sessions_started already), and every index is one more write a row
-- (the free plan counts them against its 100,000 rows written a day).
ALTER TABLE sessions ADD COLUMN ab TEXT; -- JSON { experiment key: variant }, e.g. {"CrashPanel":"Off","StreakOffer":"Double"}; NULL before 2026-11-12
