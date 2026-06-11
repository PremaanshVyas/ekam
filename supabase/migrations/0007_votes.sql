-- 0007 — tile upvotes. One vote per tile per verified email; no downvotes.
-- RLS on with NO public policies: votes are written/read by the server only
-- (service role), so voter emails never become publicly queryable.
-- Safe to run more than once.

create table if not exists tile_votes (
  tile_id uuid references tiles(id) on delete cascade not null,
  voter_email text not null,
  created_at timestamptz default now(),
  primary key (tile_id, voter_email)
);
create index if not exists tile_votes_tile_idx on tile_votes (tile_id);

alter table tile_votes enable row level security;
