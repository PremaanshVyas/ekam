-- 0006 — the review loop: artists can request a human review of an AI-returned tile,
-- and get notifications (claimed / live / returned / moderator decisions).
-- Safe to run more than once.

alter table public.tiles
  add column if not exists review_requested_at timestamptz;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  artist_email text not null,
  kind text not null,          -- claim | live | returned | mod-approved | mod-rejected
  title text not null,
  body text,
  created_at timestamptz default now(),
  read_at timestamptz
);
create index if not exists notifications_email_idx on notifications (artist_email, created_at desc);

-- RLS on, NO public policies: only the server (service role) reads/writes, scoped by
-- the signed-in session's email — emails never become publicly queryable.
alter table notifications enable row level security;
