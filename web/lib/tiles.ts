import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerOr, type Identity } from "@/lib/identity";

export type MyTile = {
  id: string; x: number; y: number; status: string; artist_name: string | null;
  image_path: string | null; story: string | null;
  pending_image_path: string | null; pending_story: string | null;
  draft_image_path: string | null; draft_story: string | null; draft_updated_at: string | null;
  ai_verdict: string | null; ai_reason: string | null; claim_expires_at: string | null;
};

// Find the signed-in person's tile (by anonymous user id, or legacy email). Tolerant of the
// pending_* (migration 0003) and draft_* (migration 0004) columns not existing yet —
// progressively falls back to the always-present columns so the dashboard / painter never
// hard-error before a migration runs.
export async function findMyTile(db: SupabaseClient, canvasId: string, who: Identity): Promise<MyTile | null> {
  const filter = ownerOr(who);
  const q = (cols: string) => db.from("tiles").select(cols)
    .eq("canvas_id", canvasId).or(filter)
    .in("status", ["claimed", "pending", "published"]).limit(1).maybeSingle();
  const fill = (d: Record<string, unknown>): MyTile =>
    ({ artist_name: null, pending_image_path: null, pending_story: null, draft_image_path: null, draft_story: null, draft_updated_at: null, ai_verdict: null, ai_reason: null, claim_expires_at: null, ...d } as MyTile);

  const withClock = await q("id, x, y, status, artist_name, image_path, story, pending_image_path, pending_story, draft_image_path, draft_story, draft_updated_at, ai_verdict, ai_reason, claim_expires_at");
  if (!withClock.error) return withClock.data ? fill(withClock.data as unknown as Record<string, unknown>) : null;
  const withAi = await q("id, x, y, status, artist_name, image_path, story, pending_image_path, pending_story, draft_image_path, draft_story, draft_updated_at, ai_verdict, ai_reason");
  if (!withAi.error) return withAi.data ? fill(withAi.data as unknown as Record<string, unknown>) : null;
  const full = await q("id, x, y, status, artist_name, image_path, story, pending_image_path, pending_story, draft_image_path, draft_story, draft_updated_at");
  if (!full.error) return full.data ? fill(full.data as unknown as Record<string, unknown>) : null;
  const mid = await q("id, x, y, status, artist_name, image_path, story, pending_image_path, pending_story");
  if (!mid.error) return mid.data ? fill(mid.data as unknown as Record<string, unknown>) : null;
  const safe = await q("id, x, y, status, artist_name, image_path, story");
  return safe.data ? fill(safe.data as unknown as Record<string, unknown>) : null;
}

export function tileImageUrl(path: string | null): string | null {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${path}` : null;
}
