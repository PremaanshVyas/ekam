-- 0011 — move Canvas Nº 001's deadline to 23 June 2026, 11:59pm PDT.
-- Was 21 June 2026 11:59pm PDT (= 22 June 06:59:59 UTC, set in 0008).
-- 23 June 2026 11:59:59pm PDT = 24 June 2026 06:59:59 UTC.
-- The app reads canvases.closes_at live, so this takes effect with no redeploy:
-- countdowns, claim/submit locking, and the finale reveal all key off this value.
-- Safe to run more than once.

update canvases set closes_at = '2026-06-24T06:59:59Z' where slug = 'what-home-looks-like';
