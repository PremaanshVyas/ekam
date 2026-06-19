import { supabaseAnon, supabaseAdmin } from "@/lib/supabase";
import { ownerOr, type Identity } from "@/lib/identity";
import type { RealTileInput } from "@/lib/realWall";

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;

type Row = {
  id: string; x: number; y: number; status: string; artist_name: string | null; artist_location: string | null;
  story: string | null; image_path: string | null; thumb_path: string | null; published_at: string | null;
};

export type WallData = {
  tiles: RealTileInput[]; claimed: number; published: number;
  finaleFrom: string | null; finaleTo: string | null; error: boolean;
};

// Single source of truth for the public wall: used by the /canvas server render AND by the
// fetchWallTiles server action that powers live updates, so the first render and every live
// refresh produce identical data. Public tile content comes from the published-only `public_tiles`
// view (anon-safe); vote counts come from the service role (tile_votes has no public RLS policy).
export async function loadWallData(canvasId: string, me: Identity | null): Promise<WallData> {
  const db = supabaseAnon();
  const tilesRes = await db.from("public_tiles")
    .select("id, x, y, status, artist_name, artist_location, story, image_path, thumb_path, published_at")
    .eq("canvas_id", canvasId);

  // upvotes: aggregate counts + the viewer's own votes (server-only reads; emails stay private)
  const voteCount = new Map<string, number>();
  const myVotes = new Set<string>();
  try {
    const [allVotes, mine] = await Promise.all([
      supabaseAdmin().from("tile_votes").select("tile_id"),
      me ? supabaseAdmin().from("tile_votes").select("tile_id").or(ownerOr(me, "voter_user_id", "voter_email")) : Promise.resolve({ data: [] as { tile_id: string }[] }),
    ]);
    for (const v of allVotes.data ?? []) voteCount.set(v.tile_id, (voteCount.get(v.tile_id) ?? 0) + 1);
    for (const v of mine.data ?? []) myVotes.add(v.tile_id);
  } catch { /* migration 0007 not run yet */ }

  let claimed = 0, published = 0;
  let finaleFrom: string | null = null, finaleTo: string | null = null;
  const tiles = ((tilesRes.data as Row[]) ?? []).map((t) => {
    const isPub = t.status === "published";
    const ip = t.image_path;
    const img = isPub && ip ? (ip.startsWith("#") ? ip : `${SUPA}/storage/v1/object/public/tiles/${ip}`) : null;
    const thumb = isPub && t.thumb_path && !t.thumb_path.startsWith("#") ? `${SUPA}/storage/v1/object/public/tiles/${t.thumb_path}` : null;
    if (["claimed", "pending", "published"].includes(t.status)) claimed++;
    if (isPub) {
      published++;
      if (t.published_at) {
        if (!finaleFrom || t.published_at < finaleFrom) finaleFrom = t.published_at;
        if (!finaleTo || t.published_at > finaleTo) finaleTo = t.published_at;
      }
    }
    return { x: t.x, y: t.y, status: t.status, name: isPub ? t.artist_name : null, loc: isPub ? t.artist_location : null, story: isPub ? t.story : null, img, thumb, uuid: t.id, votes: voteCount.get(t.id) ?? 0, voted: myVotes.has(t.id) };
  });
  return { tiles, claimed, published, finaleFrom, finaleTo, error: !!tilesRes.error };
}
