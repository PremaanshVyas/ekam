-- 0005 — AI moderation verdicts (Claude screens every submission; admin sees the
-- verdict + reasoning in the queue; optional auto-publish for confident approvals).
-- The verdict lives on the tile; it is never exposed through public_tiles.
-- Safe to run more than once.

alter table public.tiles
  add column if not exists ai_verdict    text,         -- approve | review | reject | error
  add column if not exists ai_reason     text,
  add column if not exists ai_checked_at timestamptz;
