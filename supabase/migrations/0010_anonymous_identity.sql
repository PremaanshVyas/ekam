-- 0010 — anonymous identity. People claim + paint with NO email: a silent anonymous
-- session is created on first interaction and identity is the auth user id. Email becomes
-- optional (added at submit, for cross-device recovery + the Edition-0 list). Existing
-- email-claimed tiles keep working — ownership matches the new user id OR the legacy email.
--
-- Additive except swapping tile_votes' email primary key for per-identity partial unique
-- indexes (no rows are dropped or rewritten; legacy email votes keep their dedup).
-- Safe to run more than once. RUN THIS BEFORE deploying the matching code.

-- tiles: identity by auth user id
alter table public.tiles add column if not exists artist_user_id uuid;
create index if not exists tiles_artist_user_id_idx on public.tiles (artist_user_id);

-- notifications: key by user id too; allow a null email (anonymous owners have none)
alter table public.notifications add column if not exists artist_user_id uuid;
alter table public.notifications alter column artist_email drop not null;
create index if not exists notifications_user_idx on public.notifications (artist_user_id, created_at desc);

-- votes: key by user id; allow anonymous voters (no email). Replace the
-- (tile_id, voter_email) primary key with per-identity partial unique indexes so the
-- one-vote-per-person dedup still holds for both anonymous and email voters.
alter table public.tile_votes add column if not exists voter_user_id uuid;
alter table public.tile_votes drop constraint if exists tile_votes_pkey;
alter table public.tile_votes alter column voter_email drop not null;
create unique index if not exists tile_votes_user_uniq  on public.tile_votes (tile_id, voter_user_id) where voter_user_id is not null;
create unique index if not exists tile_votes_email_uniq on public.tile_votes (tile_id, voter_email)  where voter_email  is not null;
