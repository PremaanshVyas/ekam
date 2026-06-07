import type { SupabaseClient } from "@supabase/supabase-js";

export type MyTile = {
  id: string; x: number; y: number; status: string;
  image_path: string | null; story: string | null;
  pending_image_path: string | null; pending_story: string | null;
};

// Find the signed-in person's tile (by email). Tolerant of the pending_* columns
// not existing yet (i.e. migration 0003 not run) — falls back to safe columns so
// the dashboard / painter never hard-error.
export async function findMyTile(db: SupabaseClient, canvasId: string, email: string): Promise<MyTile | null> {
  const e = email.toLowerCase();
  const full = await db
    .from("tiles")
    .select("id, x, y, status, image_path, story, pending_image_path, pending_story")
    .eq("canvas_id", canvasId).eq("artist_email", e)
    .in("status", ["claimed", "pending", "published"])
    .limit(1).maybeSingle();
  if (!full.error && full.data) return full.data as MyTile;
  if (!full.error) return null;

  // pending_* columns may not exist yet → retry with the always-present columns.
  const safe = await db
    .from("tiles")
    .select("id, x, y, status, image_path, story")
    .eq("canvas_id", canvasId).eq("artist_email", e)
    .in("status", ["claimed", "pending", "published"])
    .limit(1).maybeSingle();
  if (safe.data) return { ...(safe.data as Omit<MyTile, "pending_image_path" | "pending_story">), pending_image_path: null, pending_story: null };
  return null;
}

export function tileImageUrl(path: string | null): string | null {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/${path}` : null;
}
