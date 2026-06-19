-- 0009 — advisor hardening (run in the Supabase SQL editor).
-- (a) Index the moderation_log → tiles foreign key (advisor: unindexed FK).
-- (b) Drop the orphan `kv_store_b0c67e98` table: not part of this app, empty,
--     unreferenced anywhere in the codebase — a leftover from a template/scaffold.
--     Removing it clears its "RLS enabled, no policy" advisor item and trims
--     attack surface.
--
-- NOT changed, and why (these advisor items are INTENTIONAL and correct — do not
-- "fix" them or you reopen the privacy holes they're protecting against):
--  • public_tiles "Security Definer View" (flagged CRITICAL): this view IS the
--    privacy boundary. It runs as definer so it can read `tiles` (RLS on, no
--    public policy) and return ONLY safe, published-tile columns — artist_email
--    is never in its select list, for any row. Switching it to security_invoker
--    would either break the public wall or require granting anon direct row
--    access to `tiles`, which WOULD leak artist_email. Keep as-is; mark the
--    advisor item "acknowledged".
--  • "RLS enabled, no policy" on tiles / moderation_log / notifications /
--    tile_votes: intentional. These are written/read only by the server
--    (service role, which bypasses RLS). No public policy = no anon/authenticated
--    access = the privacy model. Adding policies would OPEN access. Acknowledge.
-- Safe to run more than once.

create index if not exists moderation_log_tile_id_idx on public.moderation_log (tile_id);

drop table if exists public.kv_store_b0c67e98;
