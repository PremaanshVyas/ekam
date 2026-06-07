import { supabaseAdmin } from "./supabase";

// Reopen any tiles whose 24h claim window has lapsed (claimed but never submitted),
// clearing the artist data so the tile is claimable again.
export async function reopenExpiredClaims(): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiles")
    .update({
      status: "open", artist_name: null, artist_email: null, artist_location: null,
      story: null, image_path: null, claimed_at: null, claim_expires_at: null,
    })
    .eq("status", "claimed")
    .lt("claim_expires_at", new Date().toISOString())
    .select("id");
  return data?.length ?? 0;
}
