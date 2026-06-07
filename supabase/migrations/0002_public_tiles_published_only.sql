-- 0002 — Only published tiles expose content publicly.
-- Non-published rows (open/claimed/pending) return ONLY x, y, status — so the grid
-- can still render open cells, but no unapproved art/stories/emails are ever fetchable.
-- Run this in the Supabase SQL editor.

drop view if exists public_tiles;

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
