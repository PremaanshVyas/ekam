-- 0004 — per-artist autosave drafts (resume an in-progress painting across devices).
--
-- The studio autosaves the in-progress 1024px canvas to storage as draft-<tileId>.png
-- and records it here. Drafts are private-by-obscurity: the path is unguessable and is
-- only ever returned to the tile's owner. They never surface through `public_tiles`
-- (published-only), so nothing unapproved leaks. Cleared on Submit.
--
-- Safe to run more than once.

alter table public.tiles
  add column if not exists draft_image_path text,
  add column if not exists draft_story      text,
  add column if not exists draft_updated_at timestamptz;
