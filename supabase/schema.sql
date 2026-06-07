-- ekam.ink — Supabase schema
-- Source of truth: CLAUDE_MASTER_BRIEF.md §5. Run in the Supabase SQL editor
-- after creating the project (action item #6). Free tier is sufficient
-- (≤576 tiles × 512px PNGs).

create extension if not exists "pgcrypto";

create table canvases (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,            -- 'what-home-looks-like'
  title text not null,
  theme_prompt text not null,           -- 'where were you when home looked like this?'
  grid_cols int not null default 24,
  grid_rows int not null default 24,
  palette jsonb not null,               -- 10 hex strings incl. paper-white + ink-black
  status text not null default 'open',  -- open | closed | archived
  created_at timestamptz default now()
);

create table tiles (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid references canvases(id) not null,
  x int not null,
  y int not null,
  status text not null default 'open',
  -- lifecycle: open → claimed → pending → published | rejected → open
  claimed_at timestamptz,
  claim_expires_at timestamptz,         -- claimed_at + 24h; edge fn/cron reopens expired claims
  artist_name text,
  artist_email text,                    -- NEVER displayed; contact + Edition-0 list
  artist_location text,                 -- optional flavor ("Wyndham Vale, AU")
  story text check (char_length(story) <= 140),  -- the hover whisper
  image_path text,                      -- storage: 512x512 PNG
  thumb_path text,                      -- storage: 64x64 PNG (generated on approve)
  published_at timestamptz,
  unique (canvas_id, x, y)
);

create table moderation_log (
  id uuid primary key default gen_random_uuid(),
  tile_id uuid references tiles(id),
  action text not null,                 -- approved | rejected
  reason text,
  created_at timestamptz default now()
);

-- ── RLS posture (CLAUDE_MASTER_BRIEF.md §5) ────────────────────────────────
-- Public SELECT on published tiles + open-tile coordinates only.
-- Claims/submissions go through edge functions (service role).
-- /admin gated to a single allow-listed email (Mickey).
-- Storage bucket `tiles/`: public-read AFTER publish only.

alter table canvases enable row level security;
alter table tiles enable row level security;
alter table moderation_log enable row level security;

-- Anyone can read canvases.
create policy "canvases are public" on canvases
  for select using (true);

-- IMPORTANT: NO public select policy on `tiles`. With RLS enabled and no anon
-- policy, anon/authenticated cannot read the raw table at all — this is what
-- keeps artist_email unreadable (leaking it is fatal per the brief).
-- The public reads a column-projected, owner-executed VIEW instead:
-- Only published tiles expose content; non-published rows return just x,y,status.
create view public_tiles
with (security_invoker = false) as
  select
    id, canvas_id, x, y, status,
    case when status = 'published' then artist_name end     as artist_name,
    case when status = 'published' then artist_location end as artist_location,
    case when status = 'published' then story end           as story,
    case when status = 'published' then image_path end      as image_path,
    case when status = 'published' then thumb_path end      as thumb_path,
    case when status = 'published' then published_at end    as published_at
  from tiles
  where status in ('open', 'claimed', 'pending', 'published');

grant select on public_tiles to anon, authenticated;

-- Writes (claim / submit / moderate) and any read of artist_email happen only
-- via edge functions using the service role, which bypasses RLS. There are no
-- public insert/update/delete policies on any table.
