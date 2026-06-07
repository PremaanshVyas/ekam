-- ekam.ink — editable tiles + no claim expiry
-- Run this in the Supabase SQL editor.

-- 1) Pending edits to ALREADY-PUBLISHED tiles live in these columns, so the
--    current tile stays visible on the canvas until the edit is re-approved.
alter table tiles
  add column if not exists pending_image_path   text,
  add column if not exists pending_story         text,
  add column if not exists pending_submitted_at  timestamptz;

-- 2) Claims no longer expire — the canvas fills over many days, not 24h.
--    Clear any existing expiry so nothing auto-reopens.
update tiles
  set claim_expires_at = null
  where claim_expires_at is not null;
