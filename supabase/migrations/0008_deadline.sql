-- 0008 — the deadline system.
-- (a) Canvas close: after closes_at, claiming and submitting lock and the public
--     reveal triggers at whatever fill the wall reached (blanks render as paper).
-- (b) 48 hour claim window: a claimed tile that never receives a submission
--     reopens automatically. Every submission resets the artist's 48h clock;
--     expiry_warned_at dedupes the "12 hours left" notification.
--     Claims made before this migration have claim_expires_at NULL and never expire.

alter table canvases add column if not exists closes_at timestamptz;
alter table tiles    add column if not exists claim_expires_at timestamptz;
alter table tiles    add column if not exists expiry_warned_at timestamptz;

-- Canvas Nº 001 closes 17 June 2026, 11:59pm IST (18:29:59 UTC)
update canvases set closes_at = '2026-06-17T18:29:59Z';
